/**
 * Ingestion API Routes
 * Endpoints to control data ingestion services
 */

import { Router, Request, Response } from 'express';
import CompetitorIngestionService from '../../services/competitorIngestion.js';

const router = Router();

// Global ingestion service instance
let ingestionService: CompetitorIngestionService | null = null;

// GET /api/ingestion/status - Get ingestion service status
router.get('/status', (req: Request, res: Response) => {
  if (!ingestionService) {
    return res.json({
      data: {
        running: false,
        lastBlock: 0,
        knownCompetitors: 0,
        message: 'Ingestion service not initialized'
      }
    });
  }

  const stats = ingestionService.getStats();
  res.json({
    data: {
      running: stats.isRunning,
      lastBlock: stats.lastBlock,
      knownCompetitors: stats.knownCompetitors
    }
  });
});

// POST /api/ingestion/start - Start ingestion service
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { chain = 'bsc', rpcUrl } = req.body;

    if (ingestionService) {
      const stats = ingestionService.getStats();
      if (stats.isRunning) {
        return res.status(400).json({ error: 'Ingestion service already running' });
      }
    }

    ingestionService = new CompetitorIngestionService({
      chain: chain as 'bsc' | 'bscTestnet',
      rpcUrl: rpcUrl || undefined,
    });

    await ingestionService.start();

    res.json({
      data: {
        message: `Ingestion started for ${chain}`,
        ...ingestionService.getStats()
      }
    });
  } catch (error) {
    console.error('Error starting ingestion:', error);
    res.status(500).json({ error: 'Failed to start ingestion service' });
  }
});

// POST /api/ingestion/stop - Stop ingestion service
router.post('/stop', (req: Request, res: Response) => {
  if (!ingestionService) {
    return res.status(400).json({ error: 'Ingestion service not running' });
  }

  ingestionService.stop();

  res.json({
    data: {
      message: 'Ingestion stopped',
      ...ingestionService.getStats()
    }
  });
});

// POST /api/ingestion/watch - Add competitor to watch list
router.post('/watch', (req: Request, res: Response) => {
  try {
    const { address, label } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    if (!ingestionService) {
      // Create service just for database operations
      ingestionService = new CompetitorIngestionService({ chain: 'bsc' });
    }

    const competitorId = ingestionService.addWatchedCompetitor(address, label);

    res.json({
      data: {
        competitorId,
        message: `Now watching ${address}`
      }
    });
  } catch (error) {
    console.error('Error adding watched competitor:', error);
    res.status(500).json({ error: 'Failed to add watched competitor' });
  }
});

export default router;
