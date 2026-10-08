// app/+native-intent.js
//
// expo-router calls redirectSystemPath for every URL that opens the app
// (path is the full URL here, not just a path). The Google sign-in
// callback, daytickles://...#access_token=... (or #error=...), is
// handled by AuthContext's own Linking listener, which sets the session.
// When expo-router also handled it, it navigated to "/" and pushed index
// over Login: the Login screen flashed during sign-in, and a second
// Login was left mounted under the tabs. So the callback is dropped here
// ('' means expo-router doesn't navigate at all); on a cold start it
// goes to '/' as before. Every other URL passes through unchanged.

const OAUTH_FRAGMENT_PARAM = /(^|&)(access_token|error|error_description)=/;

function isOAuthCallback(url) {
  if (typeof url !== 'string' || !url.startsWith('daytickles:')) return false;
  const hashIndex = url.indexOf('#');
  return hashIndex !== -1 && OAUTH_FRAGMENT_PARAM.test(url.slice(hashIndex + 1));
}

export function redirectSystemPath({ path, initial }) {
  try {
    if (isOAuthCallback(path)) return initial ? '/' : '';
    return path;
  } catch {
    return path;
  }
}
