import { createRPCController } from '@shared/ipc/rpc';
import { routerService } from '@main/core/router/RouterService';
import { log } from '@main/lib/logger';

export const routerController = createRPCController({
  consultArchitecture: async (args: { conversationTranscript: string }) => {
    try {
      const consultation = await routerService.consultArchitecture(args.conversationTranscript);
      return { success: true as const, data: consultation };
    } catch (error) {
      log.error('Failed to consult on agent strategy:', error);
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
