import { App } from "./app";

export class AppManager {
    public static registerAppClosingEvent(app: App) {
        const gracefulShutdown: (shutdownMsg: string) => void = (shutdownMsg: string) => {
            const shutdownPromise: Promise<boolean> = app.shutdown();
            shutdownPromise.then(() => {
                console.error(shutdownMsg);
                console.error('process.exit()');
                process.exit();
            });
            shutdownPromise.catch((err: any) => {
                console.error(err);
                console.error('process.exit()');
                process.exit();
            });
        };

        // https://nodejs.org/api/process.html#process_signal_events
        process.on('SIGINT', () => {
            gracefulShutdown('SIGINT: CTRL+ C -> graceful shutdown completed -> process.exit()');
        });

        process.on('SIGHUP', () => {
            gracefulShutdown('SIGHUP: window is closed -> graceful shutdown completed -> process.exit()');
        });
    }
}