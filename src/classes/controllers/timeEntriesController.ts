import { MongoDbLogic } from './../helpers/mongoDbLogic';
import { RequestProcessingHelpers } from './../helpers/requestProcessingHelpers';
import { TimeManagement } from './../helpers/timeManagement';
import { FilterQuery } from 'mongodb';
import { Request } from 'express';
import { ITimeEntry } from './../../../../common/typescript/iTimeEntry';
import routesConfig from './..&../../../../../../common/typescript/routes.js';
import { MonogDbOperations } from '../helpers/mongoDbOperations';
import { ITimeEntryDocument } from './../../../../common/typescript/mongoDB/iTimeEntryDocument';
import _ from 'lodash';
import { IPause } from '../../../../common/typescript/iPause';
import { DurationCalculator } from '../helpers/durationCalculator';
import { ITasksDocument } from '../../../../common/typescript/mongoDB/iTasksDocument';

export default {
    getTimeEntriesForTaskIds(taskIds: string[], mongoDbOperations: MonogDbOperations) {
        if (!taskIds || taskIds.length === 0) {
            console.error('cannot get timeEntries because of missing taskIds');
        }
        return new Promise<any>((resolve: (value: any) => void) => {
            let timeEntries: ITimeEntryDocument[] = [];
            let taskIdIndex = 0;
            const promiseThenLoop = ()=>{
                if (taskIdIndex < taskIds.length) {
                    const queryObj: FilterQuery<any> = {};
                    queryObj[routesConfig.taskIdPropertyAsForeignKey] = taskIds[taskIdIndex];
                    // NEW only use the non-committed timeEntry-documents
                    queryObj[routesConfig.isDeletedInClientProperty] = false;
                
                    const promise = mongoDbOperations.getFiltered(routesConfig.timEntriesCollectionName, queryObj);
                    promise.then((retrievedTimeEntries: ITimeEntryDocument[])=>{
                        // DEBUGGING:
                        // console.error(JSON.stringify(retrievedTimeEntries, null, 4));
                        
                        timeEntries = timeEntries.concat(retrievedTimeEntries);

                        taskIdIndex++;
                        promiseThenLoop();
                    });
                    promise.catch(()=>{
                        console.error('something went wrong when getting the timeEntries for index:' + taskIdIndex);
                        console.error(JSON.stringify(taskIds, null, 4));

                        taskIdIndex++;
                        promiseThenLoop();
                    });
                } else {
                    resolve(timeEntries);
                }
            };
            // initial call
            promiseThenLoop();
        });
    },
    getTaskIdsForProjectId(projectId: string,  mongoDbOperations: MonogDbOperations) {
        const queryObj: FilterQuery<any> = {};
        queryObj[routesConfig.projectIdPropertyAsForeignKey] = projectId;
        const tasksPromise = mongoDbOperations.getFiltered(routesConfig.tasksCollectionName, queryObj);
        return new Promise<any>((resolve: (value: any) => void)=>{
            tasksPromise.then((retrievedTasks: ITasksDocument[]) => {
                // DEBUGGING:
                // console.error(JSON.stringify(retrievedTasks, null, 4));

                const taskIds: string[] = [];
                if (!retrievedTasks || retrievedTasks.length === 0) {
                    console.error('there are no tasks for projectId:' + projectId);
                    resolve(false);
                    return;
                }
                retrievedTasks.forEach((oneTask: ITasksDocument)=>{
                    const currentTaskId = oneTask.taskId;
                    taskIds.push(currentTaskId);
                });
                resolve(taskIds);
            });
            tasksPromise.catch(()=>{
                console.error('error when trying to get tasks by projectId');
                resolve(false);
            });
        });
    },
    getDurationStr(timeEntryId: string, mongoDbOperations: MonogDbOperations) {
        const queryObj: FilterQuery<any> = {};
        queryObj[routesConfig.timeEntryIdProperty] = timeEntryId;
        const timeEntriesPromise = mongoDbOperations.getFiltered(routesConfig.timEntriesCollectionName, queryObj);
        return new Promise<any>((resolve: (value: any) => void) => {
            timeEntriesPromise.then((theTimeEntriesDocs: ITimeEntryDocument[])=>{
                let durationStr = '';
                if (!theTimeEntriesDocs || theTimeEntriesDocs.length === 0) {
                    console.error('cannot get duration because of missing timeEntry-document');
                    return;
                }
                const singleTimeEntryDoc = theTimeEntriesDocs[0];
                durationStr = DurationCalculator.calculateDuration(singleTimeEntryDoc);
                resolve(durationStr);
            });
        });
        
    },
    post(req: Request, mongoDbOperations: MonogDbOperations): Promise<any> {
        const timeEntry: ITimeEntry = req.body[routesConfig.timeEntriesBodyProperty];

        const extendedTimeEntry: ITimeEntryDocument = _.clone(timeEntry) as ITimeEntryDocument;
        extendedTimeEntry.isDeletedInClient = false;
        extendedTimeEntry.startTime = new Date(extendedTimeEntry.startTime) as Date;

        // DEBUGGING string or object === date-object?
        // console.log(typeof (extendedTimeEntry.startTime))

        return mongoDbOperations.insertOne(extendedTimeEntry, routesConfig.timEntriesCollectionName);
    },
    get(req: Request, mongoDbOperations: MonogDbOperations, filterQuery?: FilterQuery<any>): Promise<any> {
        if (!filterQuery) {
            const queryObj: FilterQuery<any> = {};
            queryObj[routesConfig.isDeletedInClientProperty] = false;

            return mongoDbOperations.getFiltered(routesConfig.timEntriesCollectionName, queryObj);
        } else {
            return mongoDbOperations.getFiltered(routesConfig.timEntriesCollectionName, filterQuery);
        }
    },
    patchStop(req: Request, mongoDbOperations: MonogDbOperations): Promise<any> {
        // stop operation
        const theQueryObj = RequestProcessingHelpers.getFilerQuery(req);

        let propertyName = routesConfig.endDateProperty;
        let propertyValue: any = new Date();

        const firstPatchPromise = mongoDbOperations.patch(propertyName, propertyValue, routesConfig.timEntriesCollectionName, theQueryObj);

        return new Promise<any>((resolve: (value: any) => void, reject: (value: any) => void) => {
            firstPatchPromise.then((resolvedValue: any) => {
                resolve(resolvedValue);
            });
            firstPatchPromise.catch(() => {
                const errMsg = 'catch when trying to patch the endDate in a timeEntry:' + theQueryObj[req.body[routesConfig.httpPatchIdPropertyName]];
                console.error(errMsg);
                reject(errMsg);
            });
        });
    },
    patchTheDurationInTimeEntriesDocument(mongoDbOperations: MonogDbOperations, theSuccessfullyPatchDocumentsFromDB: ITimeEntryDocument[], req: Request): Promise<any> {
        return new Promise<any>((resolve: (value: any) => void, reject: (value: any) => void) => {
            if (!theSuccessfullyPatchDocumentsFromDB || theSuccessfullyPatchDocumentsFromDB.length === 0) {
                console.error('cannot write the duration because retrieval of document failed');
                console.error(JSON.stringify(theSuccessfullyPatchDocumentsFromDB, null, 4));
                resolve(false);
                return;
            }

            const singleDoc = theSuccessfullyPatchDocumentsFromDB[0];

            // DEBUGGING:
            // if (typeof singleDoc.startTime === 'string') {
            //     console.error('starTime is string and not date!');
            // }
            // if (typeof singleDoc.endTime === 'string') {
            //     console.error('endTime is string and  not date');
            // }

            const propertyName = routesConfig.durationProperty;
            const propertyValue = TimeManagement.timeEntryToDuration(singleDoc);

            // DEBUGGING:
            // console.error(JSON.stringify(propertyValue, null, 4));
            // console.error(JSON.stringify(singleDoc, null, 4));


            const theQueryObj = RequestProcessingHelpers.getFilerQuery(req);

            const patchPromiseForWritingTheDuration = mongoDbOperations.patch(propertyName, propertyValue, routesConfig.timEntriesCollectionName, theQueryObj);
            patchPromiseForWritingTheDuration.then(resolve);
            patchPromiseForWritingTheDuration.catch(resolve);
        });
    },
    patchDeletedInClient(req: Request, mongoDbOperations: MonogDbOperations, filterQuery?: FilterQuery<any>): Promise<any> {
        let theQueryObj: FilterQuery<any> = {};
        if (!theQueryObj) {
            const idPropertyName = req.body[routesConfig.httpPatchIdPropertyName];
            const timeEntryId = req.body[routesConfig.httpPatchIdPropertyValue];
            // https://mongodb.github.io/node-mongodb-native/3.2/tutorials/crud/
            theQueryObj[idPropertyName] = timeEntryId;    
        } else {
            theQueryObj = filterQuery;
        }
        
        const propertyName = routesConfig.isDeletedInClientProperty;
        const propertyValue = true;

        return mongoDbOperations.patch(propertyName, propertyValue, routesConfig.timEntriesCollectionName, theQueryObj);
    },
    postPause(req: Request, mongoDbOperations: MonogDbOperations): Promise<any> {
        const theQueryObj = RequestProcessingHelpers.getFilerQuery(req);

        const propertyName = routesConfig.pausesProperty;
        const propertyValue: IPause = {
            startTime: new Date(),
            endTime: null,
            duration: null
        };

        return mongoDbOperations.patchPush(propertyName, propertyValue, routesConfig.timEntriesCollectionName, theQueryObj);
    },
    patchPause(req: Request, mongoDbOperations: MonogDbOperations, documents: ITimeEntryDocument[]): Promise<any> {
        const mongoDbLogic = new MongoDbLogic(mongoDbOperations);

        const theQueryObj = RequestProcessingHelpers.getFilerQuery(req);

        return mongoDbLogic.patchLastTimeEntryPause(theQueryObj, documents);
    },
    calculatePauseAndRewriteArrayToDocument(mongoDbOperations: MonogDbOperations, filterQuery: FilterQuery<any>, documents: ITimeEntryDocument[]) {
        const mongoDbLogic = new MongoDbLogic(mongoDbOperations);

        const storeDurationsInPausesPromise = mongoDbLogic.storeDurationInPausesOfDocument(filterQuery, documents);
        return storeDurationsInPausesPromise;
    }
}