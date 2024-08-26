import { Sequelize } from 'sequelize-typescript';
import { Query, QueryGroup, Result, Torrent, GlobalSettings, TorrentContent, QueryResult } from './models';
import path from 'path';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  models: [Query, QueryGroup, Result, QueryResult, Torrent, GlobalSettings, TorrentContent],
  logging: false
});

export default sequelize;
