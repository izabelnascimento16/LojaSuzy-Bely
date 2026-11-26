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

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
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

  const data = (await response.json().catch(() => ({}))) as T & Record<string, unknown> & {error?: string};
  if (!response.ok) {
    throw new ApiError(data.error || 'Ocorreu um erro ao processar a solicitação.', response.status, data);
  }
  return data;
}

export async function uploadFilesRequest<T>(
  path: string,
  formData: FormData,
  useAdminToken = true
): Promise<T> {
  const token = useAdminToken ? adminTokenMemory : authTokenMemory;
  const headers: Record<string, string> = {
    'X-Requested-With': 'SuzyBelyStore',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = (await response.json().catch(() => ({}))) as T & Record<string, unknown> & {error?: string};
  if (!response.ok) {
    throw new ApiError(data.error || 'Erro ao enviar os ficheiros.', response.status, data);
  }
  return data;
}
