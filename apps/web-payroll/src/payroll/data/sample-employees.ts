import type { Employee } from '../tax-logic';

export const SAMPLE_EMPLOYEES: Employee[] = [
  {
    id: 'emp_001',
    name: 'Adewale Ogunlesi',
    role: 'Senior Engineer',
    email: 'adewale@example.com',
    staffId: 'AB-ENG-001',
    department: 'Engineering',
    state: 'LAGOS',
    bankName: 'GTBank',
    accountNumber: '0123456789',
    joinDate: '2025-01-15',
    compensation: [
      {
        fromMonth: '2026-01',
        toMonth: '2026-06',
        annualGross: 12000000,
        annualRent: 2400000,
        breakdown: {
          breakdownType: 'percentage',
          basicValue: 0.4,
          housingValue: 0.4,
          transportValue: 0.1,
        },
      },
      {
        fromMonth: '2026-07',
        annualGross: 15000000,
        annualRent: 3000000,
        breakdown: {
          breakdownType: 'percentage',
          basicValue: 0.4,
          housingValue: 0.4,
          transportValue: 0.1,
        },
      },
    ],
    statutory: [
      { fromMonth: '2026-01', hasPension: true, hasNHF: true, hasNHIS: false },
    ],
    allowableDeductions: [
      {
        type: 'pension_additional',
        frequency: 'monthly',
        amount: 25000,
        fromMonth: '2026-01',
        toMonth: '2026-12',
      },
      {
        type: 'owner_occupied_mortgage_interest',
        frequency: 'monthly',
        amount: 40000,
        fromMonth: '2026-03',
        toMonth: '2026-12',
      },
    ],
    employerVoluntaryContributions: [
      {
        type: 'pension_voluntary',
        frequency: 'monthly',
        amount: 25000,
        fromMonth: '2026-01',
        toMonth: '2026-12',
      },
    ],
  },
  {
    id: 'emp_002',
    name: 'Chioma Okeke',
    role: 'Product Manager',
    email: 'chioma@example.com',
    staffId: 'AB-PROD-002',
    department: 'Product',
    state: 'FCT',
    bankName: 'Access Bank',
    accountNumber: '1234567890',
    joinDate: '2026-02-01',
    compensation: [
      {
        fromMonth: '2026-02',
        annualGross: 9500000,
        breakdown: {
          breakdownType: 'percentage',
          basicValue: 0.45,
          housingValue: 0.35,
          transportValue: 0.1,
        },
      },
    ],
    statutory: [
      { fromMonth: '2026-02', hasPension: true, hasNHF: false, hasNHIS: true },
    ],
    allowableDeductions: [
      {
        type: 'life_insurance_premium',
        frequency: 'monthly',
        amount: 12000,
        fromMonth: '2026-02',
        toMonth: '2026-12',
      },
      {
        type: 'pension_additional',
        frequency: 'once',
        amount: 150000,
        fromMonth: '2026-11',
      },
    ],
  },
  {
    id: 'emp_003',
    name: "Musa Yar'adua",
    role: 'Analyst',
    email: 'musa@example.com',
    staffId: 'AB-FIN-003',
    department: 'Finance',
    state: 'KANO',
    bankName: 'FirstBank',
    accountNumber: '0987654321',
    joinDate: '2025-09-10',
    compensation: [
      {
        fromMonth: '2026-01',
        annualGross: 4500000,
        annualRent: 900000,
        breakdown: {
          breakdownType: 'amount',
          basicValue: 1800000,
          housingValue: 1200000,
          transportValue: 450000,
        },
      },
    ],
    statutory: [
      {
        fromMonth: '2026-01',
        toMonth: '2026-05',
        hasPension: false,
        hasNHF: false,
        hasNHIS: false,
      },
      { fromMonth: '2026-06', hasPension: true, hasNHF: false, hasNHIS: false },
    ],
    allowableDeductions: [
      {
        type: 'owner_occupied_mortgage_interest',
        frequency: 'once',
        amount: 300000,
        fromMonth: '2026-08',
      },
    ],
  },
];
