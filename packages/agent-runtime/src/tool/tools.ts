import type { ToolArgs, ToolResult } from '@shared-types/agent';
import { ToolRegistry } from './registry';
import { ContextBuilder, Retriever } from '@runtime/rag';

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface RegisterToolsOptions {
  retriever?: Retriever;
  contextBuilder?: ContextBuilder;
}

export function registerTools(registry: ToolRegistry, options: RegisterToolsOptions = {}): void {
  registry.register({
    name: 'calculator',
    description: '执行简单数学计算，支持 add/sub/mul/div',
    risk: 'low',
    async execute(args) {
      const { op, a, b } = args as { op: string; a: number; b: number };
      await delay(50);

      let result: number;
      switch (op) {
        case 'add': result = a + b; break;
        case 'sub': result = a - b; break;
        case 'mul': result = a * b; break;
        case 'div': result = b === 0 ? NaN : a / b; break;
        default:
          return {
            success: false,
            toolName: 'calculator',
            error: `Unknown op: ${op}`,
            duration: 50,
          };
      }

      return {
        success: true,
        toolName: 'calculator',
        data: `${a} ${op} ${b} = ${result}`,
        duration: 50,
      };
    },
  });

  registry.register({
    name: 'getWeather',
    description: '查询指定城市的天气情况',
    risk: 'low',
    argsSchema: {
      city: { type: 'string', required: true, description: '城市名称' },
    },
    async execute(args) {
      const { city } = args as { city: string };
      await delay(100);

      const weatherDB: Record<string, { condition: string; temp: number; humidity: number }> = {
        北京: { condition: '晴', temp: 28, humidity: 45 },
        上海: { condition: '多云', temp: 30, humidity: 70 },
        广州: { condition: '雷阵雨', temp: 32, humidity: 85 },
        深圳: { condition: '小雨', temp: 29, humidity: 80 },
      };

      const data = weatherDB[city];
      if (!data) {
        return {
          success: false,
          toolName: 'getWeather',
          error: `暂不支持查询 "${city}" 的天气，当前仅支持：${Object.keys(weatherDB).join('、')}`,
          duration: 100,
        };
      }

      return {
        success: true,
        toolName: 'getWeather',
        data: `${city}：${data.condition}，气温 ${data.temp}°C，湿度 ${data.humidity}%`,
        duration: 100,
      };
    },
  });

  // No high-risk tool ships in the demo: a registered high-risk tool would
  // dead-end because the console has no approval action yet. The guardrail and
  // risk checker remain unit-tested with a test-local high-risk tool.
  registry.register({
    name: 'querySalesData',
    description: '查询指定区域和月份的销售数据',
    risk: 'medium',
    argsSchema: {
      region: { type: 'string', required: true, description: '销售区域（华东/华北/华南/西部）' },
      month: { type: 'string', required: true, description: '月份，格式 YYYY-MM' },
    },
    async execute(args) {
      const { region, month } = args as { region: string; month: string };
      await delay(150);

      const salesDB: Record<string, Record<string, { revenue: number; orders: number; avgPrice: number }>> = {
        华东: {
          '2024-01': { revenue: 1250000, orders: 1250, avgPrice: 1000 },
          '2024-02': { revenue: 980000, orders: 980, avgPrice: 1000 },
        },
        华北: {
          '2024-01': { revenue: 880000, orders: 880, avgPrice: 1000 },
          '2024-02': { revenue: 1100000, orders: 1100, avgPrice: 1000 },
        },
        华南: {
          '2024-01': { revenue: 1500000, orders: 1500, avgPrice: 1000 },
        },
      };

      const regionData = salesDB[region];
      if (!regionData) {
        return {
          success: false,
          toolName: 'querySalesData',
          error: `不支持的区域 "${region}"，当前仅支持：${Object.keys(salesDB).join('、')}`,
          duration: 150,
        };
      }

      const monthData = regionData[month];
      if (!monthData) {
        return {
          success: false,
          toolName: 'querySalesData',
          error: `区域 "${region}" 暂无 ${month} 的销售数据`,
          duration: 150,
        };
      }

      return {
        success: true,
        toolName: 'querySalesData',
        data: `${region} ${month} 销售数据：营收 ¥${monthData.revenue}，订单 ${monthData.orders} 单，客单价 ¥${monthData.avgPrice}`,
        duration: 150,
      };
    },
  });

  registry.register({
    name: 'searchKnowledge',
    description: '在知识库中检索相关文档',
    risk: 'low',
    argsSchema: {
      query: { type: 'string', required: false, description: '用户问题或搜索语句' },
      keyword: { type: 'string', required: false, description: '兼容旧示例的搜索关键词' },
      limit: { type: 'number', required: false, description: '返回结果数量，默认 3' },
    },
    async execute(args) {
      const { query, keyword, limit = 3 } = args as { query?: string; keyword?: string; limit?: number };
      const searchQuery = query || keyword;
      const startedAt = Date.now();

      if (!searchQuery) {
        return {
          success: false,
          toolName: 'searchKnowledge',
          error: 'searchKnowledge requires query or keyword',
          duration: Date.now() - startedAt,
        };
      }

      if (!options.retriever || !options.contextBuilder) {
        return {
          success: false,
          toolName: 'searchKnowledge',
          error: 'RAG dependencies are not configured: retriever and contextBuilder are required',
          duration: Date.now() - startedAt,
        };
      }

      const logs = [
        `searchKnowledge received query: ${searchQuery}`,
        `Retriever topK: ${limit}`,
      ];
      const retrieveResult = options.retriever.retrieve(searchQuery, limit);
      logs.push(`Retriever returned ${retrieveResult.documents.length} documents in ${retrieveResult.duration}ms`);

      if (retrieveResult.documents.length === 0) {
        return {
          success: false,
          toolName: 'searchKnowledge',
          error: `知识库中未找到 "${searchQuery}" 的相关文档`,
          data: {
            query: searchQuery,
            documents: [],
            documentCount: 0,
            retrievalDuration: retrieveResult.duration,
            logs,
          },
          duration: Date.now() - startedAt,
        };
      }

      const ragContext = options.contextBuilder.build(searchQuery, retrieveResult.documents);
      logs.push(`ContextBuilder produced ${ragContext.context.length} characters of context`);

      return {
        success: true,
        toolName: 'searchKnowledge',
        data: {
          query: searchQuery,
          context: ragContext.context,
          documents: ragContext.documents.map(document => ({
            id: document.id,
            score: document.score,
            matchedKeywords: document.matchedKeywords,
            metadata: document.metadata,
            content: document.content,
          })),
          documentCount: ragContext.documentCount,
          retrievalDuration: retrieveResult.duration,
          logs,
        },
        duration: Date.now() - startedAt,
      };
    },
  });

  registry.register({
    name: 'calculateMetrics',
    description: '根据销售数据计算指标（同比、环比、占比等）',
    risk: 'medium',
    argsSchema: {
      current: { type: 'number', required: true, description: '当前值' },
      previous: { type: 'number', required: true, description: '对比值' },
      metric: { type: 'string', required: true, description: '指标类型：growth（增长率）/ share（占比）' },
    },
    async execute(args) {
      const { current, previous, metric } = args as { current: number; previous: number; metric: string };
      await delay(80);

      switch (metric) {
        case 'growth':
          if (previous === 0) {
            return {
              success: false,
              toolName: 'calculateMetrics',
              error: '计算增长率时 previous 不能为 0',
              duration: 80,
            };
          }
          const growthRate = ((current - previous) / previous) * 100;
          return {
            success: true,
            toolName: 'calculateMetrics',
            data: `增长率：${current} vs ${previous} = ${growthRate > 0 ? '+' : ''}${growthRate.toFixed(2)}%`,
            duration: 80,
          };

        case 'share':
          if (current + previous === 0) {
            return {
              success: false,
              toolName: 'calculateMetrics',
              error: 'current + previous 不能为 0',
              duration: 80,
            };
          }
          const share = (current / (current + previous)) * 100;
          return {
            success: true,
            toolName: 'calculateMetrics',
            data: `占比：${current} / (${current}+${previous}) = ${share.toFixed(2)}%`,
            duration: 80,
          };

        default:
          return {
            success: false,
            toolName: 'calculateMetrics',
            error: `不支持的指标类型 "${metric}"，当前支持：growth、share`,
            duration: 80,
          };
      }
    },
  });
}
