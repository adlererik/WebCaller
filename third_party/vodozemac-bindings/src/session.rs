use vodozemac::olm::SessionConfig;
use wasm_bindgen::prelude::*;

use crate::error_to_js;

use super::OlmMessage;

#[wasm_bindgen]
pub struct Session {
    pub(super) inner: vodozemac::olm::Session,
}

impl Clone for Session {
    fn clone(&self) -> Self {
        let pickled = self.inner.pickle();
        let session = vodozemac::olm::Session::from_pickle(pickled);
        Self { inner: session }
    }
}

#[wasm_bindgen]
pub enum SessionConfigVersion {
    V1,
    V2,
}

impl From<SessionConfigVersion> for SessionConfig {
    fn from(value: SessionConfigVersion) -> Self {
        match value {
            SessionConfigVersion::V1 => SessionConfig::version_1(),
            SessionConfigVersion::V2 => SessionConfig::version_2(),
        }
    }
}

#[wasm_bindgen]
impl Session {
    pub fn pickle(&self, pickle_key: &[u8]) -> Result<String, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;

        Ok(self.inner.pickle().encrypt(pickle_key))
    }

    pub fn from_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Session, JsValue> {
        let pickle_key: &[u8; 32] = pickle_key
            .try_into()
            .map_err(|_| JsError::new("Invalid pickle key length, expected 32 bytes"))?;
        let pickle = vodozemac::olm::SessionPickle::from_encrypted(pickle, pickle_key)
            .map_err(error_to_js)?;

        let session = vodozemac::olm::Session::from_pickle(pickle);

        Ok(Self { inner: session })
    }

    pub fn from_libolm_pickle(pickle: &str, pickle_key: &[u8]) -> Result<Session, JsValue> {
        let session =
            vodozemac::olm::Session::from_libolm_pickle(pickle, pickle_key).map_err(error_to_js)?;

        Ok(Self { inner: session })
    }

    #[wasm_bindgen(getter)]
    pub fn session_id(&self) -> String {
        self.inner.session_id()
    }

    pub fn session_matches(&self, message: &OlmMessage) -> bool {
        let message =
            vodozemac::olm::OlmMessage::from_parts(message.message_type, &message.ciphertext);

        match message {
            Ok(m) => {
                if let vodozemac::olm::OlmMessage::PreKey(m) = m {
                    self.inner.session_keys() == m.session_keys()
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }

    pub fn encrypt(&mut self, plaintext: &str) -> Result<OlmMessage, JsValue> {
        let message = self.inner.encrypt(plaintext).map_err(error_to_js)?;

        let (message_type, ciphertext) = message.to_parts();

        Ok(OlmMessage {
            ciphertext: ciphertext,
            message_type,
        })
    }

    pub fn decrypt(&mut self, message: &OlmMessage) -> Result<String, JsValue> {
        let message =
            vodozemac::olm::OlmMessage::from_parts(message.message_type, &message.ciphertext)
                .map_err(error_to_js)?;

        Ok(
            String::from_utf8(self.inner.decrypt(&message).map_err(error_to_js)?)
                .map_err(error_to_js)?,
        )
    }
}
