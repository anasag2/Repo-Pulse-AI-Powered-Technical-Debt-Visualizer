import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import type { Commit, DashboardSummary, ErrorResponse, FileDetail, FileNode, HealthStatus, Repository, RepositoryInput } from './api.schemas';
import { customFetch } from '../custom-fetch';
import type { ErrorType, BodyType } from '../custom-fetch';
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
export declare const getHealthCheckUrl: () => string;
/**
 * Returns server health status
 * @summary Health check
 */
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListRepositoriesUrl: () => string;
/**
 * @summary List all repositories
 */
export declare const listRepositories: (options?: RequestInit) => Promise<Repository[]>;
export declare const getListRepositoriesQueryKey: () => readonly ["/api/repositories"];
export declare const getListRepositoriesQueryOptions: <TData = Awaited<ReturnType<typeof listRepositories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRepositories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listRepositories>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListRepositoriesQueryResult = NonNullable<Awaited<ReturnType<typeof listRepositories>>>;
export type ListRepositoriesQueryError = ErrorType<unknown>;
/**
 * @summary List all repositories
 */
export declare function useListRepositories<TData = Awaited<ReturnType<typeof listRepositories>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listRepositories>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getAnalyzeRepositoryUrl: () => string;
/**
 * @summary Analyze a new repository
 */
export declare const analyzeRepository: (repositoryInput: RepositoryInput, options?: RequestInit) => Promise<Repository>;
export declare const getAnalyzeRepositoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof analyzeRepository>>, TError, {
        data: BodyType<RepositoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof analyzeRepository>>, TError, {
    data: BodyType<RepositoryInput>;
}, TContext>;
export type AnalyzeRepositoryMutationResult = NonNullable<Awaited<ReturnType<typeof analyzeRepository>>>;
export type AnalyzeRepositoryMutationBody = BodyType<RepositoryInput>;
export type AnalyzeRepositoryMutationError = ErrorType<unknown>;
/**
* @summary Analyze a new repository
*/
export declare const useAnalyzeRepository: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof analyzeRepository>>, TError, {
        data: BodyType<RepositoryInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof analyzeRepository>>, TError, {
    data: BodyType<RepositoryInput>;
}, TContext>;
export declare const getGetRepositoryUrl: (id: number) => string;
/**
 * @summary Get repository details
 */
export declare const getRepository: (id: number, options?: RequestInit) => Promise<Repository>;
export declare const getGetRepositoryQueryKey: (id: number) => readonly [`/api/repositories/${number}`];
export declare const getGetRepositoryQueryOptions: <TData = Awaited<ReturnType<typeof getRepository>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRepository>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getRepository>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetRepositoryQueryResult = NonNullable<Awaited<ReturnType<typeof getRepository>>>;
export type GetRepositoryQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get repository details
 */
export declare function useGetRepository<TData = Awaited<ReturnType<typeof getRepository>>, TError = ErrorType<ErrorResponse>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getRepository>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getDeleteRepositoryUrl: (id: number) => string;
/**
 * @summary Delete a repository
 */
export declare const deleteRepository: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteRepositoryMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteRepository>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteRepository>>, TError, {
    id: number;
}, TContext>;
export type DeleteRepositoryMutationResult = NonNullable<Awaited<ReturnType<typeof deleteRepository>>>;
export type DeleteRepositoryMutationError = ErrorType<unknown>;
/**
* @summary Delete a repository
*/
export declare const useDeleteRepository: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteRepository>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteRepository>>, TError, {
    id: number;
}, TContext>;
export declare const getListFilesUrl: (id: number) => string;
/**
 * @summary List all file nodes for 3D visualization
 */
export declare const listFiles: (id: number, options?: RequestInit) => Promise<FileNode[]>;
export declare const getListFilesQueryKey: (id: number) => readonly [`/api/repositories/${number}/files`];
export declare const getListFilesQueryOptions: <TData = Awaited<ReturnType<typeof listFiles>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listFiles>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListFilesQueryResult = NonNullable<Awaited<ReturnType<typeof listFiles>>>;
export type ListFilesQueryError = ErrorType<unknown>;
/**
 * @summary List all file nodes for 3D visualization
 */
export declare function useListFiles<TData = Awaited<ReturnType<typeof listFiles>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listFiles>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetFileUrl: (id: number, fileId: number) => string;
/**
 * @summary Get file details with risk factors and recent commits
 */
export declare const getFile: (id: number, fileId: number, options?: RequestInit) => Promise<FileDetail>;
export declare const getGetFileQueryKey: (id: number, fileId: number) => readonly [`/api/repositories/${number}/files/${number}`];
export declare const getGetFileQueryOptions: <TData = Awaited<ReturnType<typeof getFile>>, TError = ErrorType<ErrorResponse>>(id: number, fileId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFile>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFileQueryResult = NonNullable<Awaited<ReturnType<typeof getFile>>>;
export type GetFileQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get file details with risk factors and recent commits
 */
export declare function useGetFile<TData = Awaited<ReturnType<typeof getFile>>, TError = ErrorType<ErrorResponse>>(id: number, fileId: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFile>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getListCommitsUrl: (id: number) => string;
/**
 * @summary Get recent commits for a repository
 */
export declare const listCommits: (id: number, options?: RequestInit) => Promise<Commit[]>;
export declare const getListCommitsQueryKey: (id: number) => readonly [`/api/repositories/${number}/commits`];
export declare const getListCommitsQueryOptions: <TData = Awaited<ReturnType<typeof listCommits>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCommits>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listCommits>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListCommitsQueryResult = NonNullable<Awaited<ReturnType<typeof listCommits>>>;
export type ListCommitsQueryError = ErrorType<unknown>;
/**
 * @summary Get recent commits for a repository
 */
export declare function useListCommits<TData = Awaited<ReturnType<typeof listCommits>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listCommits>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export declare const getGetDashboardSummaryUrl: () => string;
/**
 * @summary Get dashboard summary statistics
 */
export declare const getDashboardSummary: (options?: RequestInit) => Promise<DashboardSummary>;
export declare const getGetDashboardSummaryQueryKey: () => readonly ["/api/dashboard/summary"];
export declare const getGetDashboardSummaryQueryOptions: <TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDashboardSummaryQueryResult = NonNullable<Awaited<ReturnType<typeof getDashboardSummary>>>;
export type GetDashboardSummaryQueryError = ErrorType<unknown>;
/**
 * @summary Get dashboard summary statistics
 */
export declare function useGetDashboardSummary<TData = Awaited<ReturnType<typeof getDashboardSummary>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDashboardSummary>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map