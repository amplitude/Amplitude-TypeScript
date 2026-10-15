import { PAGE_URL_OPERATOR_CONTAINS, type PageScope, type PageUrlOperator } from './types';

export function stripQueryAndHash(url: string | undefined): string {
  if (!url) return '';
  return url.split(/[?#]/)[0];
}

export const getPageUrlFromScope = (scope: PageScope): string => scope.pageUrl ?? '';

export type SinglePagePageScope = Extract<PageScope, { pageUrl: string }>;

export const isSinglePagePageScope = (scope: PageScope): scope is SinglePagePageScope =>
  !('pageGroupId' in scope && scope.pageGroupId);

export const getPageUrlOperatorFromScope = (scope: PageScope): PageUrlOperator | undefined => {
  if ('pageGroupId' in scope && scope.pageGroupId) {
    return undefined;
  }
  return scope.pageUrlOperator;
};

export const getAllowQueryParamsFromScope = (scope: PageScope): boolean => {
  if ('pageGroupId' in scope && scope.pageGroupId) {
    return false;
  }
  return scope.allowQueryParams === true;
};

export const getEffectivePageUrlFromScope = (scope: PageScope | null | undefined): string => {
  if (!scope) {
    return '';
  }

  const rawPageUrl = getPageUrlFromScope(scope);
  const rawPageUrlOperator = getPageUrlOperatorFromScope(scope);
  const allowQueryParams = getAllowQueryParamsFromScope(scope);
  const skipStrip = allowQueryParams || rawPageUrlOperator === PAGE_URL_OPERATOR_CONTAINS;

  if (skipStrip) {
    return rawPageUrl ?? '';
  }

  return stripQueryAndHash(rawPageUrl);
};

export const resolvePageScope = (
  pageScope: PageScope | null | undefined,
  ...fallbackUrls: Array<string | undefined | null>
): PageScope | null => {
  if (pageScope) {
    if (!pageScope.pageUrl && 'pageGroupId' in pageScope) {
      const url = fallbackUrls.find((u) => u);
      if (url) {
        return { ...pageScope, pageUrl: url };
      }
    }
    return pageScope;
  }

  const url = fallbackUrls.find((u) => u);
  if (url) {
    return { pageUrl: url };
  }
  return null;
};

export const areUrlsEquivalent = (a: string | undefined, b: string | undefined): boolean => {
  if (!a || !b) {
    return true;
  }
  const normalize = (url: string): string => stripQueryAndHash(url).replace(/\/+$/, '');
  return normalize(a) === normalize(b);
};
