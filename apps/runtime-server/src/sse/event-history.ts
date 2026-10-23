import fs from 'node:fs';
import path from 'node:path';
import type { AgentServerEvent } from '@shared-types/api';

export interface EventHistoryStorage {
  /** Load every persisted event, grouped by task id. */
  load: () => Map<string, AgentServerEvent[]>;
  /** Append one event. Implementations must never throw into the runtime. */
  append: (event: AgentServerEvent) => void;
}

/**
 * JSONL per task: cheap append, easy to inspect, no database required.
 */
export function createFileEventHistory(dataDir: string): EventHistoryStorage {
  const eventsDir = path.join(dataDir, 'events');
  fs.mkdirSync(eventsDir, { recursive: true });

  return {
    load: () => {
      const history = new Map<string, AgentServerEvent[]>();

      for (const fileName of fs.readdirSync(eventsDir)) {
        if (!fileName.endsWith('.jsonl')) continue;
        const taskId = fileName.slice(0, -'.jsonl'.length);
        const events: AgentServerEvent[] = [];

        try {
          const content = fs.readFileSync(path.join(eventsDir, fileName), 'utf8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              const event = JSON.parse(line) as AgentServerEvent;
              if (event && typeof event.id === 'string' && typeof event.type === 'string') {
                events.push(event);
              }
            } catch {
              // Skip a corrupt line instead of losing the whole task history.
            }
          }
        } catch (error) {
          console.warn(
            `[EventHistory] Could not read ${fileName}:`,
            error instanceof Error ? error.message : error,
          );
        }

        if (events.length > 0) history.set(taskId, events);
      }

      return history;
    },
    append: (event) => {
      try {
        const file = path.join(eventsDir, `${safeFileName(event.taskId)}.jsonl`);
        fs.appendFileSync(file, `${JSON.stringify(event)}\n`, 'utf8');
      } catch (error) {
        console.warn(
          '[EventHistory] Could not append event:',
          error instanceof Error ? error.message : error,
        );
      }
    },
  };
}

function safeFileName(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_-]/g, '_');
}
