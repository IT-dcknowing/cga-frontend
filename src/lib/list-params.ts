import type { PaginationState, SortingState, Updater } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import type { SetURLSearchParams } from 'react-router';
import { config } from '@/lib/config';

/*
 * Critères d'une liste gardés dans l'adresse (recherche, filtres, tri, page) : retour arrière et lien
 * partagé les conservent. Les valeurs lues sont limitées aux listes blanches de l'écran, comme le
 * serveur le fait de son côté (02-TRD §6.7).
 */

/** La valeur si elle fait partie des valeurs permises, `null` sinon. */
export function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return values.find((candidate) => candidate === value) ?? null;
}

/** Texte d'un paramètre, `null` s'il est absent ou vide. */
export function textParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name)?.trim() ?? '';

  return value === '' ? null : value;
}

/** Page demandée, à partir de 1. */
export function pageParam(params: URLSearchParams, name: string): number {
  const page = Number.parseInt(params.get(name) ?? '', 10);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** Adresse avec un critère changé ; un nouveau critère ramène à la première page. */
export function withFilter(
  current: URLSearchParams,
  name: string,
  value: string,
  pageName = 'page',
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (value === '') {
    next.delete(name);
  } else {
    next.set(name, value);
  }

  if (name !== pageName) {
    next.delete(pageName);
  }

  return next;
}

export function sortingOf(sort: string | null): SortingState {
  return sort === null ? [] : [{ id: sort.replace(/^-/, ''), desc: sort.startsWith('-') }];
}

export function sortOf(sorting: SortingState): string {
  const [first] = sorting as (SortingState[number] | undefined)[];

  return first === undefined ? '' : `${first.desc ? '-' : ''}${first.id}`;
}

/**
 * Pagination et tri du `DataTable` reliés à l'adresse : changer de page ou de tri écrit le paramètre
 * correspondant.
 */
export function useTableParams({
  page,
  pageSize,
  sort,
  setFilter,
  names = { page: 'page', sort: 'tri' },
}: {
  page: number;
  pageSize: number | undefined;
  sort: string | null;
  setFilter: (name: string, value: string) => void;
  names?: { page: string; sort: string };
}) {
  const pagination: PaginationState = {
    pageIndex: page - 1,
    pageSize: pageSize ?? config.pageSize,
  };
  const sorting = sortingOf(sort);

  return {
    pagination,
    sorting,
    onPaginationChange(updater: Updater<PaginationState>) {
      const next = typeof updater === 'function' ? updater(pagination) : updater;

      setFilter(names.page, next.pageIndex === 0 ? '' : String(next.pageIndex + 1));
    },
    onSortingChange(updater: Updater<SortingState>) {
      setFilter(names.sort, sortOf(typeof updater === 'function' ? updater(sorting) : updater));
    },
  };
}

/**
 * Champ de recherche d'une liste : la saisie part dans l'adresse après une pause de frappe
 * (`searchDebounceMs`), sans empiler l'historique ; une adresse changée sans la saisie (retour
 * arrière) remet le champ à la recherche de l'adresse.
 */
export function useSearchInput(
  searchInUrl: string,
  setParams: SetURLSearchParams,
  name: string,
  pageName = 'page',
) {
  const [search, setSearch] = useState(searchInUrl);
  const [lastSeen, setLastSeen] = useState(searchInUrl);

  if (searchInUrl !== lastSeen) {
    setLastSeen(searchInUrl);

    if (searchInUrl !== search.trim()) {
      setSearch(searchInUrl);
    }
  }

  useEffect(() => {
    const wanted = search.trim();

    if (wanted === searchInUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      setParams((current) => withFilter(current, name, wanted, pageName), { replace: true });
    }, config.searchDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search, searchInUrl, setParams, name, pageName]);

  return [search, setSearch] as const;
}
