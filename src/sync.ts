import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';
import path from 'path';

// Import all models from the models directory
import { Query, QueryGroup, QueryResult, Result, Torrent, TorrentContent } from './models';

// Load environment variables from .env file
dotenv.config();

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../database.sqlite'),
  models: [Query, Result, Torrent, QueryGroup, QueryResult, TorrentContent],
});

async function syncDatabase() {
  try {
    await sequelize.drop();
    
    await sequelize.sync({ alter: true });
    console.log('Database synced successfully');
  } catch (error) {
    console.error('Error syncing database:', (error as Error).message);
  } finally {
    await sequelize.close();
  }
}

syncDatabase();