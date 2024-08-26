import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany } from 'sequelize-typescript';
import { Result } from './Result';
import { type CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';
import { QBittorrentTorrentState } from '../qBittorrent/types/QBittorrentTorrentsMethods';
import { ITorrent } from '../types/Torrent';
import { TorrentContent } from './TorrentContent';

@Table({
  timestamps: false,
})
export class Torrent extends Model<ITorrent> {
  @Column({
    type: DataType.STRING,
    primaryKey: true,
  })
  hash!: string;

  @Column(DataType.STRING)
  name!: string;

  @Column(DataType.STRING)
  category!: string;

  @Column(DataType.DATE)
  added_on!: Date;

  @Column(DataType.INTEGER)
  total_size!: number;

  @Column(DataType.FLOAT)
  progress!: number;

  @Column(DataType.INTEGER)
  time_active!: number;

  @Column(DataType.INTEGER)
  num_seeds!: number;

  @Column(DataType.INTEGER)
  num_leechs!: number;

  @HasMany(() => Result, { foreignKey: 'infoHash', sourceKey: 'hash' })
  results!: Result[];

  // Additional columns based on QBittorrentTorrentInfo

  @Column(DataType.FLOAT)
  availability!: number;

  @Column(DataType.DATE)
  completion_on!: Date;

  @Column(DataType.INTEGER)
  dlspeed!: number;

  @Column(DataType.INTEGER)
  eta!: number;

  @Column(DataType.BOOLEAN)
  f_l_piece_prio!: boolean;

  @Column(DataType.BOOLEAN)
  force_start!: boolean;

  @Column(DataType.DATE)
  last_activity!: Date;

  @Column(DataType.INTEGER)
  num_complete!: number;

  @Column(DataType.INTEGER)
  num_incomplete!: number;

  @Column(DataType.INTEGER)
  priority!: number;

  @Column(DataType.STRING)
  save_path!: string;

  @Column(DataType.DATE)
  seen_complete!: Date;

  @Column(DataType.BOOLEAN)
  seq_dl!: boolean;

  @Column(DataType.INTEGER)
  size!: number;

  @Column(DataType.STRING)
  state!: QBittorrentTorrentState; //string; // Assuming QBittorrentTorrentState type is a string enum

  @Column(DataType.STRING)
  tags!: string;

  @Column(DataType.STRING)
  tracker!: string;

  @Column(DataType.INTEGER)
  upspeed!: number;

  @Column(DataType.STRING)
  piece_states!: string;

  @HasMany(() => TorrentContent)
  contents!: CreationOptional<TorrentContent[]>;
}