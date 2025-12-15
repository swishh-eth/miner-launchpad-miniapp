"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, AreaSeries, type IChartApi, type ISeriesApi, type AreaData, type Time } from "lightweight-charts";

type PriceChartProps = {
  data: { time: number; value: number }[];
  isLoading?: boolean;
  color?: string;
  height?: number;
};

export function PriceChart({
  data,
  isLoading = false,
  color = "#ec4899",
  height = 200,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [mounted, setMounted] = useState(false);

  // Delay mount to let page layout stabilize
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Initialize/update chart
  useEffect(() => {
    if (!mounted || !chartContainerRef.current || isLoading || data.length === 0) return;

    const container = chartContainerRef.current;
    const width = container.clientWidth;
    if (width === 0) return;

    // Clean up existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    try {
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#71717a",
          fontFamily: "monospace",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        width: width,
        height: height,
        handleScroll: false,
        handleScale: false,
        rightPriceScale: { visible: false },
        timeScale: { visible: false, borderVisible: false },
        crosshair: {
          vertLine: { visible: false, labelVisible: false },
          horzLine: { visible: false, labelVisible: false },
        },
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: color,
        topColor: `${color}40`,
        bottomColor: `${color}00`,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });

      const chartData: AreaData<Time>[] = data.map((d) => ({
        time: d.time as Time,
        value: d.value,
      }));
      areaSeries.setData(chartData);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      seriesRef.current = areaSeries;
    } catch (error) {
      console.error("Failed to create chart:", error);
    }

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && container.clientWidth > 0) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [mounted, color, height, data, isLoading]);

  const showUnavailable = !isLoading && data.length === 0;

  return (
    <div style={{ height }} className="w-full relative overflow-hidden">
      <div ref={chartContainerRef} className="w-full h-full" />
      {showUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs bg-black">
          Chart data unavailable
        </div>
      )}
    </div>
  );
}
