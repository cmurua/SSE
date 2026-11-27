// Operaciones historicas (RF06). Copia de los schemas de
// apps/backend/app/domains/historicals/schemas.py, con los mismos nombres en
// snake_case: httpClient no traduce las claves, igual que en RealtimeSample y
// ReactorVariable.

/** OperationSummary del backend. Los instantes son ISO 8601 en UTC. */
export interface OperationSummary {
  id: string;
  name: string;
  started_at: string;
  /** null mientras la operacion sigue abierta. El listado y el detalle solo
   *  devuelven operaciones cerradas, asi que ahi siempre viene. */
  ended_at: string | null;
  operator: string;
  /** Minutos enteros; null si la operacion no cerro. */
  duration_minutes: number | null;
}

/** OperationListItem: una fila del listado. */
export interface OperationListItem extends OperationSummary {
  notes: string | null;
  sample_count: number;
}

/** OperationPage: respuesta de GET /historicals/operations. */
export interface OperationPage {
  items: OperationListItem[];
  /** Operaciones que cumplen los filtros, sin paginar. */
  total: number;
  /** Pagina devuelta, empezando en 1. */
  page: number;
  page_size: number;
}

/** OperationDetail: respuesta de GET /historicals/operations/{id}. */
export interface OperationDetail extends OperationListItem {
  /** null si la operacion no tiene muestras. */
  first_sample_at: string | null;
  last_sample_at: string | null;
}
