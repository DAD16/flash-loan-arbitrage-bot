import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useStore } from '../store/useStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000, // 10 second timeout
});

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log errors but don't crash
    console.error('API Error:', error.message);
    // Return a default response to prevent crashes
    return Promise.reject(error);
  }
);

// Types
export interface Competitor {
  id: string;
  address: string;
  chain: string;
  label: string | null;
  is_watched: number;
  total_profit_wei: string;
  total_transactions: number;
  success_rate: number;
  last_active_at: string | null;
}

export interface Opportunity {
  id: string;
  chain: string;
  route_tokens: string[];
  route_token_symbols: string[] | null;
  route_dexes: string[];
  expected_profit_wei: string;
  expected_profit_usd: number | null;
  expected_net_profit_wei: string | null;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
  confidence_score: number | null;
  status: string;
  detected_at: string;
}

export interface Execution {
  id: string;
  chain: string;
  tx_hash: string | null;
  status: 'pending' | 'success' | 'failed' | 'reverted';
  net_profit_wei: string | null;
  net_profit_usd: number | null;
  execution_time_ms: number | null;
  created_at: string;
}

export interface Recommendation {
  id: string;
  category: string;
  priority: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  expected_profit_increase_pct: number | null;
  status: string;
}

export interface OverviewData {
  total_profit: {
    total_profit_wei: string | null;
    total_profit_usd: number | null;
  };
  today: any;
  pending_opportunities: number;
  pending_recommendations: number;
  top_competitors: Competitor[];
  recent_executions: Execution[];
}

// Overview Hook
export function useOverview() {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['overview', chain],
    queryFn: async () => {
      const { data } = await api.get<{ data: OverviewData }>('/overview', {
        params: { chain },
      });
      return data.data;
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });
}

// Competitors Hooks
export function useCompetitors(watched?: boolean) {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['competitors', chain, watched],
    queryFn: async () => {
      const { data } = await api.get('/competitors', {
        params: { chain, watched: watched ? 'true' : undefined },
      });
      return data;
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });
}

export function useCompetitorLeaderboard() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['competitors', 'leaderboard', chain],
    queryFn: async () => {
      const { data } = await api.get('/competitors/leaderboard', {
        params: { chain },
      });
      return data.data;
    },
  });
}

// Opportunities Hooks
export function useOpportunities(status?: string) {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['opportunities', chain, status],
    queryFn: async () => {
      const { data } = await api.get('/opportunities', {
        params: { chain, status },
      });
      return data;
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });
}

export function usePendingOpportunities() {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['opportunities', 'pending', chain],
    queryFn: async () => {
      const { data } = await api.get('/opportunities/pending', {
        params: { chain },
      });
      return data.data as Opportunity[];
    },
    refetchInterval: autoRefresh ? 3000 : false,
  });
}

export function useOpportunityStats() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['opportunities', 'stats', chain],
    queryFn: async () => {
      const { data } = await api.get('/opportunities/stats', {
        params: { chain },
      });
      return data.data;
    },
  });
}

// Executions Hooks
export function useExecutions() {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['executions', chain],
    queryFn: async () => {
      const { data } = await api.get('/executions', {
        params: { chain },
      });
      return data;
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });
}

export function useRecentExecutions() {
  const chain = useStore((state) => state.selectedChain);
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['executions', 'recent', chain],
    queryFn: async () => {
      const { data } = await api.get('/executions/recent', {
        params: { chain },
      });
      return data.data as Execution[];
    },
    refetchInterval: autoRefresh ? 5000 : false,
  });
}

export function useExecutionStats() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['executions', 'stats', chain],
    queryFn: async () => {
      const { data } = await api.get('/executions/stats', {
        params: { chain },
      });
      return data.data;
    },
  });
}

// Recommendations Hooks
export function useRecommendations(status?: string) {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['recommendations', chain, status],
    queryFn: async () => {
      const { data } = await api.get('/recommendations', {
        params: { chain, status },
      });
      return data;
    },
  });
}

export function usePendingRecommendations() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['recommendations', 'pending', chain],
    queryFn: async () => {
      const { data } = await api.get('/recommendations/pending', {
        params: { chain },
      });
      return data.data as Recommendation[];
    },
  });
}

// Strategy Hooks
export function useCurrentStrategy() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['strategy', 'current', chain],
    queryFn: async () => {
      const { data } = await api.get('/strategy/current', {
        params: { chain },
      });
      return data.data;
    },
  });
}

export function useDexes() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['strategy', 'dexes', chain],
    queryFn: async () => {
      const { data } = await api.get('/strategy/dexes', {
        params: { chain },
      });
      return data.data;
    },
  });
}

export function useTokens() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['strategy', 'tokens', chain],
    queryFn: async () => {
      const { data } = await api.get('/strategy/tokens', {
        params: { chain },
      });
      return data.data;
    },
  });
}

// Performance Hooks
export function useDailyPerformance(days: number = 30) {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['performance', 'daily', chain, days],
    queryFn: async () => {
      const { data } = await api.get('/performance/daily', {
        params: { chain, days },
      });
      return data.data;
    },
  });
}

export function usePerformanceSummary() {
  const chain = useStore((state) => state.selectedChain);

  return useQuery({
    queryKey: ['performance', 'summary', chain],
    queryFn: async () => {
      const { data } = await api.get('/performance/summary', {
        params: { chain },
      });
      return data.data;
    },
  });
}

// Multi-Chain Stats Hook
export interface ChainStats {
  chainId: string;
  chainName: string;
  status: 'online' | 'degraded' | 'offline';
  rpcLatencyMs: number;
  currentGasPrice: number;
  blockTime: number;
  activePairs: number;
  isMonitoring: boolean;
  opportunityCount: number;
  best24hSpread: number;
  profit24h: number;
}

export function useMultiChainStats() {
  const autoRefresh = useStore((state) => state.autoRefresh);

  return useQuery({
    queryKey: ['chains', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<{ data: ChainStats[] }>('/chains/stats');
      return data.data;
    },
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30s
  });
}

// Mutations
export function useApplyRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/recommendations/${id}/apply`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}

export function useDismissRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { data } = await api.post(`/recommendations/${id}/dismiss`, { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });
}

export function useSaveStrategy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (strategy: any) => {
      const { data } = await api.post('/strategy', strategy);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy'] });
    },
  });
}

// Execute Opportunity Mutation
export interface ExecuteOpportunityResponse {
  execution_id: string;
  tx_hash: string;
  status: string;
  message: string;
}

export function useExecuteOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opportunityId: string) => {
      const { data } = await api.post<{ data: ExecuteOpportunityResponse }>(
        `/opportunities/${opportunityId}/execute`
      );
      return data.data;
    },
    onSuccess: () => {
      // Invalidate related queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['executions'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}
