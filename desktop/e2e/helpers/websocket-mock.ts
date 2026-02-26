import { Page } from '@playwright/test';

export interface MockWebSocketServer {
  port: number;
  sendSpanEvent: (span: any) => void;
  sendLogEvent: (log: any) => void;
  sendMetricUpdate: (metrics: any) => void;
  sendGatewayState: (state: any) => void;
  close: () => void;
}

export async function createMockWebSocketServer(page: Page, port: number = 9876): Promise<MockWebSocketServer> {
  await page.addInitScript((port) => {
    const originalWebSocket = window.WebSocket;
    const connections: any[] = [];

    class MockWebSocket extends EventTarget {
      public readyState: number = 0;
      public CONNECTING = 0;
      public OPEN = 1;
      public CLOSING = 2;
      public CLOSED = 3;
      public url: string;
      public onopen: ((ev: Event) => any) | null = null;
      public onclose: ((ev: CloseEvent) => any) | null = null;
      public onerror: ((ev: Event) => any) | null = null;
      public onmessage: ((ev: MessageEvent) => any) | null = null;

      constructor(url: string) {
        super();
        this.url = url;
        connections.push(this);

        setTimeout(() => {
          this.readyState = this.OPEN;
          const event = new Event('open');
          if (this.onopen) this.onopen(event);
          this.dispatchEvent(event);
        }, 10);
      }

      send(data: string) {
        const parsed = JSON.parse(data);
        console.log('[MockWebSocket] Sent:', parsed);
      }

      close() {
        this.readyState = this.CLOSING;
        setTimeout(() => {
          this.readyState = this.CLOSED;
          const event = new CloseEvent('close');
          if (this.onclose) this.onclose(event);
          this.dispatchEvent(event);
        }, 10);
      }
    }

    (window as any).WebSocket = MockWebSocket;
    (window as any).__mockWebSocketConnections = connections;
  }, port);

  return {
    port,
    sendSpanEvent: async (span: any) => {
      await page.evaluate((span) => {
        const connections = (window as any).__mockWebSocketConnections || [];
        connections.forEach((ws: any) => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({
              event: 'span',
              data: span
            })
          });
          if (ws.onmessage) ws.onmessage(event);
        });
      }, span);
    },
    sendLogEvent: async (log: any) => {
      await page.evaluate((log) => {
        const connections = (window as any).__mockWebSocketConnections || [];
        connections.forEach((ws: any) => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({
              event: 'log',
              data: log
            })
          });
          if (ws.onmessage) ws.onmessage(event);
        });
      }, log);
    },
    sendMetricUpdate: async (metrics: any) => {
      await page.evaluate((metrics) => {
        const connections = (window as any).__mockWebSocketConnections || [];
        connections.forEach((ws: any) => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({
              event: 'metric_update',
              data: metrics
            })
          });
          if (ws.onmessage) ws.onmessage(event);
        });
      }, metrics);
    },
    sendGatewayState: async (state: any) => {
      await page.evaluate((state) => {
        const connections = (window as any).__mockWebSocketConnections || [];
        connections.forEach((ws: any) => {
          const event = new MessageEvent('message', {
            data: JSON.stringify({
              event: 'gateway_state',
              data: state
            })
          });
          if (ws.onmessage) ws.onmessage(event);
        });
      }, state);
    },
    close: async () => {
      await page.evaluate(() => {
        const connections = (window as any).__mockWebSocketConnections || [];
        connections.forEach((ws: any) => ws.close());
      });
    }
  };
}
