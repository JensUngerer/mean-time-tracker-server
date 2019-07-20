import { MonogDbOperations} from './../helpers/mongoDbOperations';
import { Request } from 'express';
import routes from '../../../../common/typescript/routes.js';
import { IProject } from './../../../../common/typescript/iProject';

export default {
    post(req: Request): Promise<any> {
        const project: IProject = req.body[routes.projectBodyProperty];
        
        const mongoDbOperations: MonogDbOperations = new MonogDbOperations();
        mongoDbOperations.prepareConnection();
        return mongoDbOperations.insertOne(project, routes.projectsCollectionName);
    }
};