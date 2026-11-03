import type { DatasourceType } from '../datasource.js';

export type BackendLimitFacts = {
  documented_limits: readonly Readonly<{ limit: string; source_url: string }>[];
  premium: boolean;
};

const DELEGATION_URL = 'https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview';
const DELEGATION_LIMIT = {
  limit: 'Nondelegable query row limit: 500 records by default; 10,000 maximum.',
  source_url: DELEGATION_URL,
} as const;

export const BACKEND_LIMITS = {
  dataverse: {
    documented_limits: [
      DELEGATION_LIMIT,
      {
        limit: 'Power Apps connector class: Premium.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/',
      },
    ],
    premium: true,
  },
  sharepoint: {
    documented_limits: [
      DELEGATION_LIMIT,
      {
        limit: 'Power Apps connector class: Standard.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/sharepointonline/',
      },
    ],
    premium: false,
  },
  sql: {
    documented_limits: [
      DELEGATION_LIMIT,
      {
        limit: 'Power Apps connector class: Premium.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/sql/',
      },
    ],
    premium: true,
  },
  excel: {
    documented_limits: [
      DELEGATION_LIMIT,
      {
        limit: 'Power Apps connector class: Standard.',
        source_url: 'https://learn.microsoft.com/en-us/connectors/excelonlinebusiness/',
      },
    ],
    premium: false,
  },
} as const satisfies Partial<Readonly<Record<DatasourceType, BackendLimitFacts>>>;
