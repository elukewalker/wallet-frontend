import axios, { AxiosResponse } from 'axios';
import { useMemo } from 'react';
import Cookies from 'js-cookie';
import { Err, Ok, Result } from 'ts-results';

import { requestForToken } from '../firebase';
import { jsonParseTaggedBinary, jsonStringifyTaggedBinary, toBase64Url } from '../util';
import { LocalStorageKeystore, WebauthnPrfEncryptionKeyInfo } from '../services/LocalStorageKeystore';
import { UserData, Verifier } from './types';


const walletBackendUrl = process.env.REACT_APP_WALLET_BACKEND_URL;

enum CookieName {
	appToken = 'appToken',
	displayName = 'displayName',
	username = 'username',
	webauthnCredentialCredentialId = 'webauthnCredentialCredentialId',
};

type SessionState = {
	[CookieName.username]?: string,
	[CookieName.displayName]?: string,
	[CookieName.webauthnCredentialCredentialId]?: string,
};

export interface BackendApi {
	del(path: string): Promise<AxiosResponse>,
	get(path: string): Promise<AxiosResponse>,
	post(path: string, body: object): Promise<AxiosResponse>,

	getSession(): SessionState,
	isLoggedIn(): boolean,
	getAppToken(): string | undefined,
	clearSession(): void,

	login(username: string, password: string, keystore: LocalStorageKeystore): Promise<Result<void, any>>,
	loginWebauthn(keystore: LocalStorageKeystore): Promise<
		Result<void, 'loginKeystoreFailed' | 'passkeyInvalid' | 'passkeyLoginFailedTryAgain' | 'passkeyLoginFailedServerError'>
	>,
	signup(username: string, password: string, keystore: LocalStorageKeystore): Promise<Result<void, any>>,
	signupWebauthn(name: string, keystore: LocalStorageKeystore): Promise<
		Result<void, 'passkeySignupFailedServerError' | 'passkeySignupFailedTryAgain' | 'passkeySignupFinishFailedServerError' | 'passkeySignupKeystoreFailed'>
	>,

	getAllPresentations(): Promise<AxiosResponse>,
	getAllVerifiers(): Promise<Verifier[]>,
	initiatePresentationExchange(verifier_id: number, scope_name: string): Promise<{ redirect_to?: string }>,
};

export function useApi(): BackendApi {
	return useMemo(
		() => {

			function getAppToken(): string | undefined {
				return Cookies.get(CookieName.appToken);
			}

			function transformResponse(data: any): any {
				if (data) {
					return jsonParseTaggedBinary(data);
				} else {
					return data;
				}
			}

			async function get(path: string): Promise<AxiosResponse> {
				return await axios.get(
					`${walletBackendUrl}${path}`,
					{
						headers: {
							Authorization: `Bearer ${getAppToken()}`,
						},
						transformResponse,
					},
				);
			}

			async function post(path: string, body: object): Promise<AxiosResponse> {
				return await axios.post(
					`${walletBackendUrl}${path}`,
					body,
					{
						headers: {
							Authorization: `Bearer ${getAppToken()}`,
							'Content-Type': 'application/json',
						},
						transformRequest: (data, headers) => jsonStringifyTaggedBinary(data),
						transformResponse,
					},
				);
			}

			async function del(path: string): Promise<AxiosResponse> {
				return await axios.delete(
					`${walletBackendUrl}${path}`,
					{
						headers: {
							Authorization: `Bearer ${getAppToken()}`,
						},
						transformResponse,
					});
			}

			function getSession(): SessionState {
				return [
					CookieName.username,
					CookieName.displayName,
					CookieName.webauthnCredentialCredentialId,
				].reduce(
					(result, name) => ({ ...result, [name]: Cookies.get(name) }),
					{},
				);
			}

			function isLoggedIn(): boolean {
				return getSession().username !== undefined;
			}

			function clearSession(): void {
				Object.values(CookieName).forEach((name) => {
					Cookies.remove(name);
				});
			}

			function setSessionCookies(response: AxiosResponse, credential: PublicKeyCredential | null): void {
				Object.values(CookieName).forEach((name) => {
					Cookies.set(name, response.data[name]);
				});
				Cookies.set(CookieName.webauthnCredentialCredentialId, credential?.id);
			}

			async function login(username: string, password: string, keystore: LocalStorageKeystore): Promise<Result<void, any>> {
				try {
					const response = await post('/user/login', { username, password });
					setSessionCookies(response, null);

					const userData = response.data as UserData;
					const privateData = jsonParseTaggedBinary(userData.privateData);
					try {
						await keystore.unlockPassword(privateData, password, privateData.passwordKey);
						return Ok.EMPTY;
					} catch (e) {
						console.error("Failed to unlock local keystore", e);
						return Err(e);
					}

				} catch (error) {
					console.error('Failed to log in', error);
					return Err(error);
				}
			};

			async function signup(username: string, password: string, keystore: LocalStorageKeystore): Promise<Result<void, any>> {
				const fcm_token = await requestForToken();
				const browser_fcm_token = fcm_token;

				try {
					const { publicData, privateData } = await keystore.initPassword(password);

					try {
						const response = await post('/user/register', {
							username,
							password,
							fcm_token,
							browser_fcm_token,
							displayName: username,
							keys: publicData,
							privateData: jsonStringifyTaggedBinary(privateData),
						});
						setSessionCookies(response, null);
						return Ok.EMPTY;

					} catch (e) {
						console.error("Signup failed", e);
						return Err(e);
					}

				} catch (e) {
					console.error("Failed to initialize local keystore", e);
					return Err(e);
				}
			}

			async function getAllVerifiers(): Promise<Verifier[]> {
				try {
					const result = await get('/verifiers/all');
					const { verifiers } = result.data;
					console.log("verifiers = ", verifiers)
					return verifiers;
				}
				catch (error) {
					console.error("Failed to fetch all verifiers", error);
					throw error;
				}
			}

			async function getAllPresentations(): Promise<AxiosResponse> {
				try {
					const result = await get('/storage/vp');
					return result.data; // Return the Axios response.
				}
				catch (error) {
					console.error("Failed to fetch all presentations", error);
					throw error;
				}
			}



			async function initiatePresentationExchange(verifier_id: number, scope_name: string): Promise<{ redirect_to?: string }> {
				try {
					const result = await post('/presentation/initiate', { verifier_id, scope_name });
					const { redirect_to } = result.data;
					return { redirect_to };
				}
				catch (error) {
					console.error("Failed to fetch all verifiers", error);
					throw error;
				}
			}
			async function getPrfOutput(
				credential: PublicKeyCredential,
				rpId: string,
				prf: { eval: { first: BufferSource } } | { evalByCredential: { [credentialId: string]: { first: BufferSource } } },
			): Promise<[ArrayBuffer, PublicKeyCredential]> {
				type PrfExtensionOutput = { enabled: boolean, results?: { first?: ArrayBuffer } };
				const clientExtensionOutputs = credential.getClientExtensionResults() as { prf?: PrfExtensionOutput };

				if (clientExtensionOutputs?.prf?.results?.first) {
					return [clientExtensionOutputs?.prf?.results?.first, credential];

				} else if (clientExtensionOutputs?.prf?.enabled || (credential.response as any).signature) {
					const getCredential = await navigator.credentials.get({
						publicKey: {
							rpId,
							challenge: crypto.getRandomValues(new Uint8Array(32)),
							allowCredentials: [{
								type: "public-key",
								id: credential.rawId,
							}],
							extensions: { prf } as AuthenticationExtensionsClientInputs,
						},
					}) as PublicKeyCredential;

					const extOutputs = getCredential.getClientExtensionResults() as { prf?: PrfExtensionOutput };
					if (extOutputs?.prf?.results?.first) {
						return [extOutputs.prf.results.first, getCredential];
					} else {
						throw { errorId: "prf_not_supported" };
					}

				} else {
					throw { errorId: "prf_not_supported" };
				}
			}


			async function loginWebauthn(keystore: LocalStorageKeystore): Promise<
				Result<void, 'loginKeystoreFailed' | 'passkeyInvalid' | 'passkeyLoginFailedTryAgain' | 'passkeyLoginFailedServerError'>
			> {
				try {
					const beginResp = await post('/user/login-webauthn-begin', {});
					console.log("begin", beginResp);
					const beginData = beginResp.data;

					try {
						const credential = await navigator.credentials.get(beginData.getOptions) as PublicKeyCredential;
						const response = credential.response as AuthenticatorAssertionResponse;
						console.log("asserted", credential);

						try {
							const finishResp = await post('/user/login-webauthn-finish', {
								challengeId: beginData.challengeId,
								credential: {
									type: credential.type,
									id: credential.id,
									rawId: credential.id,
									response: {
										authenticatorData: toBase64Url(response.authenticatorData),
										clientDataJSON: toBase64Url(response.clientDataJSON),
										signature: toBase64Url(response.signature),
										userHandle: toBase64Url(response.userHandle),
									},
									authenticatorAttachment: credential.authenticatorAttachment,
									clientExtensionResults: credential.getClientExtensionResults(),
								},
							});
							setSessionCookies(finishResp, credential);

							try {
								const userData = finishResp.data as UserData;
								const privateData = jsonParseTaggedBinary(userData.privateData);

								const [prfOutput, prfCredential] = await getPrfOutput(
									credential,
									beginData.getOptions.publicKey.rpId,
									{
										evalByCredential: privateData.prfKeys.reduce(
											(result: { [credentialId: string]: { first: BufferSource } }, keyInfo: WebauthnPrfEncryptionKeyInfo) => {
												result[toBase64Url(keyInfo.credentialId)] = { first: keyInfo.prfSalt };
												return result;
											},
											{},
										),
									}
								);
								const keyInfo = privateData.prfKeys.find(keyInfo => toBase64Url(keyInfo.credentialId) === prfCredential.id);
								await keystore.unlockPrf(privateData, prfOutput, keyInfo);
								return Ok.EMPTY;
							} catch (e) {
								console.error("Failed to open keystore", e);
								return Err('loginKeystoreFailed');
							}

						} catch (e) {
							return Err('passkeyInvalid');
						}

					} catch (e) {
						return Err('passkeyLoginFailedTryAgain');
					}

				} catch (e) {
					return Err('passkeyLoginFailedServerError');
				}
			};

			async function signupWebauthn(name: string, keystore: LocalStorageKeystore): Promise<
				Result<void, 'passkeySignupFailedServerError' | 'passkeySignupFailedTryAgain' | 'passkeySignupFinishFailedServerError' | 'passkeySignupKeystoreFailed'>
			> {
				try {
					const beginResp = await post('/user/register-webauthn-begin', {});
					console.log("begin", beginResp);
					const beginData = beginResp.data;

					try {
						const prfSalt = crypto.getRandomValues(new Uint8Array(32))
						const credential = await navigator.credentials.create({
							...beginData.createOptions,
							publicKey: {
								...beginData.createOptions.publicKey,
								user: {
									...beginData.createOptions.publicKey.user,
									name,
									displayName: name,
								},
								extensions: {
									prf: {
										eval: {
											first: prfSalt,
										},
									},
								},
							},
						}) as PublicKeyCredential;
						const response = credential.response as AuthenticatorAttestationResponse;
						console.log("created", credential);

						try {
							const [prfOutput,] = await getPrfOutput(credential, beginData.createOptions.publicKey.rp.id, { eval: { first: prfSalt } });
							const { publicData, privateData } = await keystore.initPrf(credential, prfSalt, new Uint8Array(prfOutput));

							try {
								const fcm_token = await requestForToken();
								const browser_fcm_token = fcm_token;

								const finishResp = await post('/user/register-webauthn-finish', {
									challengeId: beginData.challengeId,
									fcm_token,
									browser_fcm_token,
									displayName: name,
									keys: publicData,
									privateData: jsonStringifyTaggedBinary(privateData),
									credential: {
										type: credential.type,
										id: credential.id,
										rawId: credential.id,
										response: {
											attestationObject: toBase64Url(response.attestationObject),
											clientDataJSON: toBase64Url(response.clientDataJSON),
											transports: response.getTransports(),
										},
										authenticatorAttachment: credential.authenticatorAttachment,
										clientExtensionResults: credential.getClientExtensionResults(),
									},
								});
								setSessionCookies(finishResp, credential);
								return Ok.EMPTY;

							} catch (e) {
								return Err('passkeySignupFailedServerError');
							}

						} catch (e) {
							return Err('passkeySignupKeystoreFailed');
						}

					} catch (e) {
						return Err('passkeySignupFailedTryAgain');
					}

				} catch (e) {
					return Err('passkeySignupFinishFailedServerError');
				}
			}

			return {
				clearSession,
				del,
				get,
				getAllPresentations,
				getAllVerifiers,
				getAppToken,
				getSession,
				initiatePresentationExchange,
				isLoggedIn,
				login,
				loginWebauthn,
				post,
				setSessionCookies,
				signup,
				signupWebauthn,
			};
		},
		[],
	);
}
