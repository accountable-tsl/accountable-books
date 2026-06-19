export type DemoContact = {
  id: string;
  displayName: string;
  email: string;
  status: 'active' | 'archived';
  companyId: string;
  userId: string;
};

/**
 * Map to store created demo contacts by company ID
 * This is populated after contacts are inserted into the database
 */
export const demoContactsByCompanyMap = new Map<string, DemoContact[]>();
