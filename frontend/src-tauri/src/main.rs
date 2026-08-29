use std::collections::HashMap;

use tauri::{Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_deep_link::DeepLinkExt;

const APP_ORIGIN: &str = "https://aasopharma-erp-pilot-production-eb9b.up.railway.app";
const SUPABASE_HOST: &str = "rgihahbmkrmhitjdjvev.supabase.co";
const OAUTH_AUTHORIZE_PATH: &str = "/auth/v1/authorize";
const DESKTOP_CALLBACK_PATH: &str = "/desktop-oauth-callback.html";

fn is_https_origin(url: &Url, host: &str) -> bool {
    url.scheme() == "https"
        && url.host_str().is_some_and(|candidate| candidate.eq_ignore_ascii_case(host))
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
}

fn app_host() -> &'static str {
    "aasopharma-erp-pilot-production-eb9b.up.railway.app"
}

fn single_query_values(url: &Url) -> Option<HashMap<String, String>> {
    let mut values = HashMap::new();
    for (key, value) in url.query_pairs() {
        if values.insert(key.into_owned(), value.into_owned()).is_some() {
            return None;
        }
    }
    Some(values)
}

fn is_allowed_app_return(url: &Url) -> bool {
    if !is_https_origin(url, app_host()) || url.fragment().is_some() {
        return false;
    }
    let Some(values) = single_query_values(url) else {
        return false;
    };
    match url.path() {
        "" | "/" => {
            values.is_empty()
                || (values.len() == 1
                    && values
                        .get("invitation_token")
                        .is_some_and(|value| (8..=2048).contains(&value.len())))
        }
        "/oauth/consent" => {
            values.len() == 1
                && values
                    .get("authorization_id")
                    .is_some_and(|value| (16..=512).contains(&value.len()))
        }
        _ => false,
    }
}

fn rewrite_google_oauth_for_desktop(url: &Url) -> Option<Url> {
    if !is_https_origin(url, SUPABASE_HOST)
        || url.path() != OAUTH_AUTHORIZE_PATH
        || url.fragment().is_some()
    {
        return None;
    }

    let values = single_query_values(url)?;
    if values.get("provider").map(String::as_str) != Some("google")
        || values
            .get("code_challenge_method")
            .is_none_or(|value| !value.eq_ignore_ascii_case("s256"))
        || values
            .get("code_challenge")
            .is_none_or(|value| !(43..=128).contains(&value.len()))
    {
        return None;
    }
    let return_to = Url::parse(values.get("redirect_to")?).ok()?;
    if !is_allowed_app_return(&return_to) {
        return None;
    }

    let mut callback = Url::parse(APP_ORIGIN).ok()?;
    callback.set_path(DESKTOP_CALLBACK_PATH);
    callback
        .query_pairs_mut()
        .append_pair("return_to", return_to.as_str());

    let mut rewritten = url.clone();
    rewritten.set_query(None);
    {
        let mut pairs = rewritten.query_pairs_mut();
        for (key, value) in url.query_pairs() {
            if key != "redirect_to" {
                pairs.append_pair(&key, &value);
            }
        }
        pairs.append_pair("redirect_to", callback.as_str());
    }
    Some(rewritten)
}

fn desktop_callback_target(url: &Url) -> Option<Url> {
    if url.scheme() != "aasopharma"
        || url.host_str() != Some("oauth")
        || url.path() != "/callback"
        || url.fragment().is_some()
    {
        return None;
    }
    let values = single_query_values(url)?;
    let return_to = Url::parse(values.get("return_to")?).ok()?;
    if !is_allowed_app_return(&return_to) {
        return None;
    }

    let has_code = values
        .get("code")
        .is_some_and(|value| (8..=2048).contains(&value.len()));
    let has_error = values
        .get("error")
        .is_some_and(|value| !value.is_empty() && value.len() <= 256);
    if has_code == has_error {
        return None;
    }
    if values.keys().any(|key| {
        !matches!(
            key.as_str(),
            "return_to" | "code" | "error" | "error_code" | "error_description"
        )
    }) {
        return None;
    }

    let mut target = return_to;
    {
        let mut pairs = target.query_pairs_mut();
        for key in ["code", "error", "error_code", "error_description"] {
            if let Some(value) = values.get(key) {
                pairs.append_pair(key, value);
            }
        }
    }
    Some(target)
}

fn handle_deep_link(window: &WebviewWindow, url: &Url) {
    if let Some(target) = desktop_callback_target(url) {
        if let Err(error) = window.navigate(target) {
            eprintln!("Unable to finish desktop Google sign-in: {error}");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let initial_url = Url::parse(APP_ORIGIN)?;
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(initial_url),
            )
            .title("AASOPharma ERP")
            .inner_size(1440.0, 900.0)
            .min_inner_size(960.0, 640.0)
            .resizable(true)
            .on_navigation(|url| {
                if is_https_origin(url, app_host()) {
                    return true;
                }
                if let Some(oauth_url) = rewrite_google_oauth_for_desktop(url) {
                    if let Err(error) = open::that_detached(oauth_url.as_str()) {
                        eprintln!("Unable to open Google sign-in in the system browser: {error}");
                    }
                    return false;
                }
                if url.scheme() == "https" {
                    if let Err(error) = open::that_detached(url.as_str()) {
                        eprintln!("Unable to open external link: {error}");
                    }
                }
                false
            })
            .build()?;

            let callback_window = window.clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    handle_deep_link(&callback_window, &url);
                }
            });
            if let Some(urls) = app.deep_link().get_current()? {
                for url in &urls {
                    handle_deep_link(&window, url);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("AASOPharma ERP could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_authorize_url(return_to: &str) -> Url {
        let mut url = Url::parse(&format!(
            "https://{SUPABASE_HOST}{OAUTH_AUTHORIZE_PATH}"
        ))
        .unwrap();
        url.query_pairs_mut()
            .append_pair("provider", "google")
            .append_pair("redirect_to", return_to)
            .append_pair("code_challenge", &"a".repeat(64))
            .append_pair("code_challenge_method", "s256");
        url
    }

    #[test]
    fn rewrites_only_valid_google_pkce_authorization() {
        let rewritten = rewrite_google_oauth_for_desktop(&valid_authorize_url(APP_ORIGIN))
            .expect("valid Google request should be opened externally");
        let callback = single_query_values(&rewritten)
            .unwrap()
            .remove("redirect_to")
            .unwrap();
        let callback = Url::parse(&callback).unwrap();
        assert_eq!(callback.path(), DESKTOP_CALLBACK_PATH);
        assert_eq!(
            single_query_values(&callback).unwrap().get("return_to"),
            Some(&format!("{APP_ORIGIN}/"))
        );

        let attacker = valid_authorize_url("https://attacker.example/");
        assert!(rewrite_google_oauth_for_desktop(&attacker).is_none());
    }

    #[test]
    fn accepts_only_bounded_desktop_callbacks() {
        let mut callback = Url::parse("aasopharma://oauth/callback").unwrap();
        callback
            .query_pairs_mut()
            .append_pair("return_to", APP_ORIGIN)
            .append_pair("code", "authorized-code");
        let target = desktop_callback_target(&callback).unwrap();
        assert!(is_https_origin(&target, app_host()));
        assert_eq!(single_query_values(&target).unwrap().get("code"), Some(&"authorized-code".to_string()));

        callback
            .query_pairs_mut()
            .append_pair("unexpected", "value");
        assert!(desktop_callback_target(&callback).is_none());
    }
}
