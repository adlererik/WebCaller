use std::collections::HashMap;

use vodozemac::olm::SessionConfig;
use wasm_bindgen::prelude::*;

use crate::{error_to_js, session::SessionConfigVersion};

use super::{session::Session, OlmMessage};

#[wasm_bindgen]
pub struct Account {
    inner: vodozemac::olm::Account,
}

#[wasm_bindgen]
pub struct InboundCreationResult {
    session: Session,
    plaintext: String,
}

#[wasm_bindgen]
impl InboundCreationResult {
    #[wasm_bindgen(getter)]
    pub fn session(&self) -> Session {
        self.session.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn plaintext(&self) -> String {
        self.plaintext.clone()
    }
}

impl TryFrom<vodozemac::olm::InboundCreationResult> for InboundCreationResult {
    type Error = JsValue;
    fn try_from(result: vodozemac::olm::InboundCreationResult) -> Result<Self, Self::Error> {
        Ok(Self {
            session: Session {
                inner: result.session,
            },
            plaintext: String::from_utf8(result.plaintext).map_err(error_to_js)?,
        })
    }
}
#[wasm_bindgen]
pub struct OneTimeKeyGenerationResult {
    pub(super) inner: vodozemac::olm::OneTimeKeyGenerationResult,
}

#[wasm_bindgen]
impl OneTimeKeyGenerationResult {
    #[wasm_bindgen(getter)]
    pub fn created(&self) -> Vec<String> {
        self.inner.created.iter().map(|k| k.to_base64()).collect()
    }

    #[wasm_bindgen(getter)]
    pub fn removed(&self) -> Vec<String> {
        self.inner.removed.iter().map(|k| k.to_base64()).collect()
    }
}

#[wasm_bindgen]
impl Account {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            inner: vodozemac::olm::Account::new(),
        }
    }

    pub fn from_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Account, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key.try_into().map_err(error_to_js)?;

        let pickle = vodozemac::olm::AccountPickle::from_encrypted(pickle, pickle_key)
            .map_err(error_to_js)?;

        let inner = vodozemac::olm::Account::from_pickle(pickle);

        Ok(Self { inner })
    }

    pub fn from_libolm_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Account, JsValue> {
        let inner =
            vodozemac::olm::Account::from_libolm_pickle(pickle, pickle_key).map_err(error_to_js)?;

        Ok(Self { inner })
    }

    pub fn pickle(&self, pickle_key: &[u8]) -> Result<String, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;

        Ok(self.inner.pickle().encrypt(pickle_key))
    }

    pub fn pickle_libolm(&self, pickle_key: &[u8]) -> Result<String, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;

        Ok(self
            .inner
            .to_libolm_pickle(pickle_key)
            .map_err(error_to_js)?)
    }

    #[wasm_bindgen(getter)]
    pub fn ed25519_key(&self) -> String {
        self.inner.ed25519_key().to_base64()
    }

    #[wasm_bindgen(getter)]
    pub fn curve25519_key(&self) -> String {
        self.inner.curve25519_key().to_base64()
    }

    pub fn sign(&self, message: &str) -> String {
        self.inner.sign(message).to_base64()
    }

    #[wasm_bindgen(getter)]
    pub fn max_number_of_one_time_keys(&self) -> usize {
        self.inner.max_number_of_one_time_keys()
    }

    #[wasm_bindgen(getter)]
    pub fn one_time_keys(&self) -> Result<JsValue, JsValue> {
        let keys: HashMap<_, _> = self
            .inner
            .one_time_keys()
            .into_iter()
            .map(|(k, v)| (k.to_base64(), v.to_base64()))
            .collect();

        Ok(serde_wasm_bindgen::to_value(&keys)?)
    }

    pub fn generate_one_time_keys(&mut self, count: usize) -> OneTimeKeyGenerationResult {
        OneTimeKeyGenerationResult {
            inner: self.inner.generate_one_time_keys(count),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn fallback_key(&self) -> Result<JsValue, JsValue> {
        let keys: HashMap<String, String> = self
            .inner
            .fallback_key()
            .into_iter()
            .map(|(k, v)| (k.to_base64(), v.to_base64()))
            .collect();

        Ok(serde_wasm_bindgen::to_value(&keys)?)
    }

    pub fn generate_fallback_key(&mut self) {
        self.inner.generate_fallback_key();
    }

    pub fn mark_keys_as_published(&mut self) {
        self.inner.mark_keys_as_published()
    }

    pub fn create_outbound_session(
        &self,
        identity_key: String,
        one_time_key: String, // can we pass it as ref?
        session_version: SessionConfigVersion,
    ) -> Result<Session, JsValue> {
        let session_config = SessionConfig::from(session_version);
        let identity_key =
            vodozemac::Curve25519PublicKey::from_base64(&identity_key).map_err(error_to_js)?;
        let one_time_key =
            vodozemac::Curve25519PublicKey::from_base64(&one_time_key).map_err(error_to_js)?;
        let session =
            self.inner
                .create_outbound_session(session_config, identity_key, one_time_key)
                .map_err(error_to_js)?;

        Ok(Session { inner: session })
    }

    pub fn create_inbound_session(
        &mut self,
        identity_key: String,
        message: &OlmMessage,
    ) -> Result<InboundCreationResult, JsValue> {
        let identity_key =
            vodozemac::Curve25519PublicKey::from_base64(&identity_key).map_err(error_to_js)?;

        let message =
            vodozemac::olm::OlmMessage::from_parts(message.message_type, &message.ciphertext)
                .map_err(error_to_js)?;

        if let vodozemac::olm::OlmMessage::PreKey(message) = message {
            // WebCaller accepts only full-authentication Olm V2 sessions.
            // Never infer or downgrade the configuration from an incoming frame.
            self.inner
                .create_inbound_session(SessionConfig::version_2(), identity_key, &message)
                .map_err(error_to_js)?
                .try_into()
        } else {
            Err(JsError::new("Invalid message type, expected a pre-key message").into())
        }
    }
}
