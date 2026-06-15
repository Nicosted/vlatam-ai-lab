export type CountryCode = 'AR' | 'CL' | 'UY' | 'PY';
export type OperationType = 'import' | 'export';

export interface TariffData {
  ncm: string;
  source: string;
  dutyRate: number;
  vatRate: number;
  statisticalRate?: number;
  preferentialRate?: number;
  effectiveDate?: string;
  evidenceRefs: string[];
}

export interface Intervention {
  agency: string;
  interventionType: string;
  operation: OperationType;
  requirement: string;
  evidenceRefs: string[];
}

export interface LegalNorm {
  normId: string;
  title: string;
  source: string;
  summary: string;
  effectiveDate?: string;
  evidenceRefs: string[];
}

export interface CostBreakdown {
  fobValue: number;
  dutyAmount: number;
  vatAmount: number;
  statisticalAmount?: number;
  otherFees?: Array<{ label: string; amount: number }>;
  totalEstimatedCost: number;
  currency: string;
  assumptions: string[];
}

export interface CountryAdapter {
  countryCode: CountryCode;
  countryName: string;
  currency: string;
  language: string;

  getTariffData(ncm: string): Promise<TariffData>;
  getInterventions(ncm: string, operation: OperationType): Promise<Intervention[]>;
  getLegalNorms(ncm: string): Promise<LegalNorm[]>;
  calculateCosts(fobValue: number, tariffData: TariffData): Promise<CostBreakdown>;
}
