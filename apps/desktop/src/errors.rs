use serde::Serialize;
use std::{collections::BTreeMap, fmt};

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum ErrorParam {
    Text(String),
    Number(i64),
    Bool(bool),
}
impl From<String> for ErrorParam {
    fn from(value: String) -> Self {
        Self::Text(value)
    }
}
impl From<&str> for ErrorParam {
    fn from(value: &str) -> Self {
        Self::Text(value.into())
    }
}
impl From<usize> for ErrorParam {
    fn from(value: usize) -> Self {
        Self::Number(value as i64)
    }
}
impl From<i32> for ErrorParam {
    fn from(value: i32) -> Self {
        Self::Number(value as i64)
    }
}
impl From<bool> for ErrorParam {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ApplicationError {
    pub code: String,
    pub params: BTreeMap<String, ErrorParam>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub causes: Vec<ApplicationError>,
}
impl ApplicationError {
    pub fn new(code: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            params: BTreeMap::new(),
            details: None,
            causes: Vec::new(),
        }
    }
    pub fn native(details: impl fmt::Display) -> Self {
        let mut error = Self::new("native");
        error.details = Some(details.to_string());
        error
    }
    pub fn param(mut self, name: &str, value: impl Into<ErrorParam>) -> Self {
        self.params.insert(name.into(), value.into());
        self
    }
    pub fn cause(mut self, error: impl Into<Self>) -> Self {
        self.causes.push(error.into());
        self
    }
    pub fn context(self, code: impl Into<String>) -> Self {
        Self::new(code).cause(self)
    }
    pub fn diagnostic_text(&self) -> String {
        self.details
            .iter()
            .cloned()
            .chain(self.causes.iter().map(Self::diagnostic_text))
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join("\n")
    }
}
impl fmt::Display for ApplicationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.diagnostic_text())
    }
}
impl std::error::Error for ApplicationError {}
impl From<String> for ApplicationError {
    fn from(value: String) -> Self {
        Self::native(value)
    }
}
impl From<&str> for ApplicationError {
    fn from(value: &str) -> Self {
        Self::native(value)
    }
}
impl From<std::io::Error> for ApplicationError {
    fn from(value: std::io::Error) -> Self {
        Self::native(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn structured_context_retains_original_git_diagnostics() {
        let error = ApplicationError::native("cherry-pick is now empty\n原始诊断")
            .context("task.cherry_pick_repository_commit");
        assert_eq!(error.code, "task.cherry_pick_repository_commit");
        assert_eq!(error.causes[0].code, "native");
        assert_eq!(
            error.diagnostic_text(),
            "cherry-pick is now empty\n原始诊断"
        );
    }
    #[test]
    fn interpolation_parameters_keep_numeric_and_boolean_types() {
        let error = ApplicationError::new("conflict.remaining")
            .param("count", 2usize)
            .param("force", false);
        assert!(matches!(
            error.params.get("count"),
            Some(ErrorParam::Number(2))
        ));
        assert!(matches!(
            error.params.get("force"),
            Some(ErrorParam::Bool(false))
        ));
    }
}
