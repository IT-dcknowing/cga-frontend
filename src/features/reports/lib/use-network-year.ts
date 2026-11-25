import { useQueries } from '@tanstack/react-query';
import {
  QUARTERS,
  networkReportKeys,
  networkReportsApi,
  type NetworkQuarter,
} from '@/features/reports/api/network-reports-api';

/** États des 4 trimestres de l'année (une requête par trimestre). */
export function useNetworkYear(year: number) {
  const results = useQueries({
    queries: QUARTERS.map((quarter) => ({
      queryKey: networkReportKeys.quarter(year, quarter),
      queryFn: () => networkReportsApi.quarter(year, quarter),
    })),
  });

  return {
    quarters: results
      .map((result) => result.data)
      .filter((data): data is NetworkQuarter => data !== undefined),
    isPending: results.some((result) => result.isPending),
    isError: results.some((result) => result.isError),
    refetch: () => {
      for (const result of results) {
        void result.refetch();
      }
    },
  };
}
