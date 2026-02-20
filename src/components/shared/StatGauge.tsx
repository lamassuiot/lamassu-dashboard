'use client';

import React from 'react';
import { ResponsiveContainer, RadialBarChart, PolarAngleAxis, RadialBar } from 'recharts';

interface StatGaugeProps {
  percentage: number;
  label: string;
  color: string;
  valueText: string;
  secondaryText?: string;
  className?: string;
}

export const StatGauge: React.FC<StatGaugeProps> = ({
  percentage,
  label,
  color,
  valueText,
  secondaryText,
  className,
}) => {
  const normalizedValue = Math.max(0, Math.min(100, percentage));
  const data = [{ name: label, value: normalizedValue, fill: color }];

  return (
    <div className={className || 'flex flex-col items-center gap-1 w-28 sm:w-32 text-center'}>
      <div className="w-20 h-20 sm:w-24 sm:h-24 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="75%"
            outerRadius="100%"
            barSize={8}
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: 'hsl(var(--muted))' }}
              dataKey="value"
              angleAxisId={0}
              cornerRadius={4}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-base sm:text-lg font-semibold text-foreground">{valueText}</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-muted-foreground tracking-wide">{label}</p>
      {secondaryText && <p className="text-xs text-muted-foreground">{secondaryText}</p>}
    </div>
  );
};
