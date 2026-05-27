import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { clients, getStats } from '../data/mock';

export function Dashboard() {
  const stats = getStats();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Sunrise Coffee Co. • January 2024</p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <StatCard
          label="Automation Rate"
          value={`${stats.automationRate}%`}
          sublabel="of transactions auto-categorized"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="AI Suggestions"
          value={stats.aiSuggested.toString()}
          sublabel="ready for review"
          icon={Clock}
          color="blue"
        />
        <StatCard
          label="Posted"
          value={stats.posted.toString()}
          sublabel="transactions finalized"
          icon={CheckCircle2}
          color="gray"
        />
        <StatCard
          label="Needs Attention"
          value={stats.needsReview.toString()}
          sublabel="manual review required"
          icon={AlertCircle}
          color="amber"
        />
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-gray-900">
            AI Categorization Queue
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {stats.aiSuggested} transactions have been categorized by AI with
            high confidence. Review and approve to post them to the ledger.
          </p>
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span>{stats.highConfidence} high confidence (90%+)</span>
            </div>
          </div>
          <Link
            to="/transactions"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Review Transactions
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-gray-900">
            Financial Reports
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            View P&L, Balance Sheet, and other reports. Every number drills down
            to the underlying transactions.
          </p>
          <div className="mb-4 text-sm text-gray-500">
            Last updated: Today at 2:34 PM
          </div>
          <Link
            to="/reports"
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            View Reports
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {/* All Clients */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900">All Clients</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {clients.map((client) => (
            <div
              key={client.id}
              className="flex cursor-pointer items-center justify-between p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 font-medium text-gray-600">
                  {client.name.charAt(0)}
                </div>
                <div>
                  <div className="font-medium text-gray-900">{client.name}</div>
                  <div className="text-sm text-gray-500">{client.industry}</div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {client.categorizedCount}/{client.transactionCount}
                  </div>
                  <div className="text-xs text-gray-500">categorized</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">
                    {client.lastActivity}
                  </div>
                </div>
                {client.status === 'review_needed' && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                    Needs Review
                  </span>
                )}
                {client.status === 'active' && (
                  <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                    Up to Date
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: typeof TrendingUp;
  color: 'green' | 'blue' | 'gray' | 'amber';
}) {
  const colorStyles = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    gray: 'bg-gray-50 text-gray-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorStyles[color]}`}
        >
          <Icon size={16} />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{sublabel}</div>
    </div>
  );
}
