// In-memory auth token store (never persisted in localStorage/sessionStorage)
let authTokenMemory: string | null = null;
let adminTokenMemory: string | null = null;

export function setCustomerToken(token: string | null): void {
  authTokenMemory = token;
}

export function getCustomerToken(): string | null {
  return authTokenMemory;
}

export function setAdminToken(token: string | null): void {
  adminTokenMemory = token;
}

export function getAdminToken(): string | null {
  return adminTokenMemory;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    useAdminToken?: boolean;
  } = {}
): Promise<T> {
  const method = options.method || 'GET';
  const token = options.useAdminToken ? adminTokenMemory : authTokenMemory;

  const headers: Record<string, string> = {
    'X-Requested-With': 'SuzyBelyStore',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as T & {error?: string};
  if (!response.ok) {
    throw new Error(data.error || 'Ocorreu um erro ao processar a solicitação.');
  }
  return data;
}
