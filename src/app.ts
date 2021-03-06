import { Application, Response, Request } from 'express';
import { Server } from 'http';
import express from 'express';
import http from 'http';
import bodyParser = require('body-parser');
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import myRoutes from './classes/routes/routes';
import * as routesConfig from './../../common/typescript/routes.js';
import { MonogDbOperations } from './classes/helpers/mongoDbOperations';

export interface IApp {
    configure(): void;
    configureExpress(): void;
    listen(port: number): void;
    shutdown(): Promise<boolean>;
    configureRest(): void;
    setupDatabaseConnection(): void;
    closeDataBaseConnection(): Promise<void>;
}

export class App implements IApp{

    private express: Application;
    private server: Server;
    public static mongoDbOperations: MonogDbOperations;

    public constructor() {
        this.express = express();
        this.server = http.createServer(this.express);
    }

    public setupDatabaseConnection() {
        App.mongoDbOperations = new MonogDbOperations();
        App.mongoDbOperations.prepareConnection();
    }

    public closeDataBaseConnection(): Promise<void> {
        return App.mongoDbOperations.closeConnection();
    }

    public configure(): void {
        this.express.use(bodyParser.json());
        this.express.use(bodyParser.urlencoded({extended: true}));
        this.express.use(helmet());
        this.express.use(cors());
    }

    public configureExpress(): void {
        const absolutePathToAppJs = process.argv[1];
        const relativePathToAppJs: string = './../../../client/dist/mtt-client';
        const pathStr: string = path.resolve(absolutePathToAppJs, relativePathToAppJs);

        this.express.use(express.static(pathStr));

        // https://stackoverflow.com/questions/25216761/express-js-redirect-to-default-page-instead-of-cannot-get
        // https://stackoverflow.com/questions/30546524/making-angular-routes-work-with-express-routes
        // https://stackoverflow.com/questions/26917424/angularjs-and-express-routing-404
        // https://stackoverflow.com/questions/26079611/node-js-typeerror-path-must-be-absolute-or-specify-root-to-res-sendfile-failed
        this.express.get('/', (request: Request, response: Response) => {
            // DEBUGGING:
            // console.log(request.url);
            // console.log(pathStr);
            response.sendFile('index.html', { root: pathStr });
        });
        this.express.get('/' + routesConfig.viewsPrefix +'*', (request: Request, response: Response) => {
            // DEBUGGING:
            // console.log(request.url);
            // console.log(pathStr);
            response.sendFile('index.html', { root: pathStr });
        });
    }

    public configureRest() {
        this.express.use('/', myRoutes);
    }

    public listen(port: number): void {
        this.server.listen(port, ()=>{
            console.error('listening on port:' + port);
        });
    }

    public shutdown(): Promise<boolean> {
        return new Promise<boolean>((resolve: (value: boolean) => void, reject: (value: any) => void) => {
        // https://hackernoon.com/graceful-shutdown-in-nodejs-2f8f59d1c357
        this.server.close((err: Error) => {
            if (err) {
                console.error('error when closing the http-server');
                // console.error(err);
                // console.error(JSON.stringify(err, null, 4));
                reject(err);
                return;
            }
            console.error('http-server successfully closed');

            resolve(true)
        });
        });
    }
}

export default new App();