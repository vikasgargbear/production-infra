/**
 * RevenueChart Component
 * Displays revenue/sales charts with time range selection
 * Optimized with React.memo and useMemo
 */

import React, { useMemo } from 'react';
import { Download, Share2 } from 'lucide-react';
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import type { SalesDataPoint, ChartTimeRange, ChartType } from '../types/dashboard.types';

interface RevenueChartProps {
    data: SalesDataPoint[];
    timeRange: ChartTimeRange;
    chartType?: ChartType;
    onTimeRangeChange: (range: ChartTimeRange) => void;
    title?: string;
    subtitle?: string;
}

const ChartHeader = React.memo<{
    title: string;
    subtitle: string;
    timeRange: ChartTimeRange;
    onTimeRangeChange: (range: ChartTimeRange) => void;
}>(({ title, subtitle, timeRange, onTimeRangeChange }) => (
    <div className="flex items-center justify-between mb-4">
        <div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1 bg-gray-50 rounded-lg p-1">
                {(['daily', 'weekly', 'monthly', 'yearly'] as ChartTimeRange[]).map(range => (
                    <button
                        key={range}
                        onClick={() => onTimeRangeChange(range)}
                        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${timeRange === range
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900'
                            }`}
                    >
                        {range.charAt(0).toUpperCase() + range.slice(1)}
                    </button>
                ))}
            </div>
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50" title="Download">
                <Download className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50" title="Share">
                <Share2 className="w-4 h-4" />
            </button>
        </div>
    </div>
));

ChartHeader.displayName = 'ChartHeader';

export const RevenueChart = React.memo<RevenueChartProps>(({
    data,
    timeRange,
    chartType = 'area',
    onTimeRangeChange,
    title = 'Revenue Overview',
    subtitle = 'Last 6 months performance'
}) => {
    const processedData = useMemo(() => {
        // Process data based on time range if needed
        return data;
    }, [data]);

    const renderChart = () => {
        const commonProps = {
            data: processedData,
            margin: { top: 5, right: 5, left: 0, bottom: 5 }
        };

        const xAxisProps = {
            dataKey: 'month',
            axisLine: false,
            tickLine: false,
            tick: { fontSize: 12 },
            tickMargin: 10
        };

        const yAxisProps = {
            axisLine: false,
            tickLine: false,
            tick: { fontSize: 12 },
            tickFormatter: (value: number) => `₹${(value / 1000).toFixed(0)}K`,
            tickMargin: 10
        };

        const tooltipProps = {
            formatter: (value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Revenue'],
            contentStyle: {
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                fontSize: '12px',
                padding: '8px 12px'
            }
        };

        if (chartType === 'area') {
            return (
                <AreaChart {...commonProps}>
                    <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                        </linearGradient>
                    </defs>
                    <XAxis {...xAxisProps} />
                    <YAxis {...yAxisProps} />
                    <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="3 3" />
                    <Tooltip {...tooltipProps} />
                    <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                        dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
                    />
                </AreaChart>
            );
        }

        return (
            <BarChart {...commonProps}>
                <XAxis {...xAxisProps} />
                <YAxis {...yAxisProps} />
                <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="3 3" />
                <Tooltip {...tooltipProps} />
                <Bar
                    dataKey="revenue"
                    fill="#3B82F6"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={60}
                />
            </BarChart>
        );
    };

    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <ChartHeader
                title={title}
                subtitle={subtitle}
                timeRange={timeRange}
                onTimeRangeChange={onTimeRangeChange}
            />
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    {renderChart()}
                </ResponsiveContainer>
            </div>
        </div>
    );
});

RevenueChart.displayName = 'RevenueChart';
