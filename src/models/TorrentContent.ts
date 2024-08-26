import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { Torrent } from './Torrent';
import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';

export enum QBittorrentTorrentContentPriority {
  DO_NOT_DOWNLOAD = 0,
  NORMAL = 1,
  HIGH = 6,
  MAXIMUM = 7,
}

@Table({
  timestamps: false,
})
export class TorrentContent extends Model<InferAttributes<TorrentContent>, InferCreationAttributes<TorrentContent>> {
  @Column({
    type: DataType.STRING,
    primaryKey: true,
  })
  id!: CreationOptional<string>;

  @Column(DataType.STRING)
  name!: string;

  @Column(DataType.BIGINT)
  size!: number;

  @Column(DataType.FLOAT)
  progress!: number;

  @Column(DataType.STRING) //(QBittorrentTorrentContentPriority.DO_NOT_DOWNLOAD, QBittorrentTorrentContentPriority.NORMAL, QBittorrentTorrentContentPriority.HIGH, QBittorrentTorrentContentPriority.MAXIMUM))
  priority!: QBittorrentTorrentContentPriority;

  @Column(DataType.BOOLEAN)
  is_seed!: boolean;

  @Column(DataType.STRING)
  piece_range!: string;

//   @Column(DataType.STRING)
//   piece_states!: string;

  @Column(DataType.FLOAT)
  availability!: number;

  @Column(DataType.STRING)
  hardlinkPath!: string;

  @ForeignKey(() => Torrent)
  @Column(DataType.STRING)
  torrentId!: CreationOptional<string>;

  @BelongsTo(() => Torrent)
  torrent!: CreationOptional<Torrent>;
}
