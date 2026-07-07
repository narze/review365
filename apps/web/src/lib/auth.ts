const TOKEN_KEY = "review365:token";
const LOGIN_KEY = "review365:login";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getLogin(): string | null {
  return localStorage.getItem(LOGIN_KEY);
}

export function hasToken(): boolean {
  return !!getToken() && !!getLogin();
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LOGIN_KEY);
}

/** Validates the token against GitHub and persists it with the derived login. */
export async function saveToken(token: string): Promise<string> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401
        ? "GitHub rejected this token. Check that it is valid and not expired."
        : `GitHub API error ${res.status}`,
    );
  }
  const user = (await res.json()) as { login: string };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LOGIN_KEY, user.login);
  return user.login;
}
