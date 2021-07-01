import mongoose from 'mongoose';
import moment from 'moment';
import dotenv from 'dotenv';

import existRepos from '../config/repos.js';

import trafficDataSchema from '../models/trafficData.js'

dotenv.config();

const databaseConnectStr = process.env.CONNECT_STRING;

const processData = (data, aggregate, sort) => {
  if (aggregate === 'true') {
    return data.map(item => { 
      delete item._id;
      if (sort === -1) {
        return {...item, startDate: moment(item.endDate).format('yyyy-MM-DD'), endDate: moment(item.startDate).format('yyyy-MM-DD')};
      }
      return {...item, startDate: moment(item.startDate).format('yyyy-MM-DD'), endDate: moment(item.endDate).format('yyyy-MM-DD')};
    });
  }
  return data.map(item => { return { date: moment(item.date).format('yyyy-MM-DD'), count: item.count, uniques: item.uniques }});
}

export const getTrafficData = async (request, response) => {
  request.setTimeout(200000);
  let dbConnect;
  try {
    let { aggregate = 'false', sort = 'desc' } = request.query;
    let { repo, days = 0 } = request.params;
    sort = (sort === 'asc' ? 1 : -1);
    days = parseInt(days);

    if (!repo) {
      return response.status(400).json({
        isSuccess: false,
        data: {},
        message: `Repo name can not be empty.`
      });
    }

    if (!existRepos.includes(repo)) {
      return response.status(404).json({
        isSuccess: false, 
        data: {},
        message: `Repo ${repo} doesn't exist in database, please check repo name and try again.`,
      });
    }

    console.log(`Repo is ${repo},`, days ? `days is ${days}` : '');
    console.log(`Aggregate is ${aggregate}, sort is ${sort}`);

    const connectStr = databaseConnectStr.replace(/{database}/, repo);
    try {
      console.log(`Connecting MongoDB ${repo}.`);
      dbConnect = await mongoose.createConnection(connectStr, { useNewUrlParser: true, useUnifiedTopology: true });
      console.log(`Connecting MongoDB ${repo} successful.`);
    } catch (error) {
      console.error(error.message);
      return response.status(404).json({
        isSuccess: false, 
        data: {},
        message: `Connect ${repo} failed with error: ${error.message}.`,
      });
    }

    console.log(`Fetching ${repo} repo traffic data.`);

    const viewsDataModel = dbConnect.model('viewsData', trafficDataSchema);
    const clonesDataModel = dbConnect.model('clonesData', trafficDataSchema);
    let viewsData = [];
    let clonesData = [];
    
    // the aggregateCondition order can not be change
    if (aggregate === 'true') {
      const aggregateCondition = [{ $sort: { date: sort } }];
      if (days) {
        aggregateCondition.push({ $limit: days < 0 ? days * -1 : days });
      }
      aggregateCondition.push({ $group: { _id: null, startDate: { $first: '$date' }, endDate: { $last: '$date' }, countTotal: { $sum: '$count' }, uniquesTotal: { $sum: '$uniques' } }})
      
      viewsData = processData(await viewsDataModel.aggregate(aggregateCondition), aggregate, sort);
      clonesData = processData(await clonesDataModel.aggregate(aggregateCondition), aggregate, sort);
    } else {
      viewsData = processData(await viewsDataModel.find().sort({ date: sort }).limit(days));
      clonesData = processData(await clonesDataModel.find().sort({ date: sort }).limit(days));
    }

    console.log(`Fetching ${repo} repo traffic data successful.`);

    response.status(200).json({
      isSuccess: true,
      data: { viewsData, clonesData },
      message: 'Successful'
    });

  } catch (error) {
    response.status(404).json({
      isSuccess: false, 
      data: [],
      message: error.message,
    });
  } finally {
    if (dbConnect) {
      dbConnect.close();
      console.log('MongoDB connect close successful.');
    }
  }
}