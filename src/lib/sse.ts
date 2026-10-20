export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Incremental Server-Sent Events parser. Feed it text chunks as they arrive from the network;
 * it calls `onMessage` once per complete event (events end with a blank line).
 */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let buffer = '';
  return {
    feed(chunk: string) {
      buffer += chunk.replace(/\r\n?/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (data.length > 0) onMessage({ event, data: data.join('\n') });
      }
    },
  };
}
