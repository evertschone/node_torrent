import { Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany, BelongsToMany } from 'sequelize-typescript';
import { Query, Torrent, QueryResult } from './index';
import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';

@Table({
  timestamps: true,
})
export class Result extends Model<InferAttributes<Result>, InferCreationAttributes<Result>> {
  @Column({
    type: DataType.TEXT,
    primaryKey: true,
  })
  guid!: string;

  @Column(DataType.STRING)
  title!: string;

  @Column(DataType.TEXT)
  link!: string;

  @Column(DataType.TEXT)
  magnet!: string;

  @Column(DataType.STRING)
  info!: string;

  @Column(DataType.INTEGER)
  seeders!: number;

  @Column(DataType.INTEGER)
  leechers!: number;

  @Column(DataType.INTEGER)
  size!: number;

  @Column(DataType.STRING)
  age!: string;

  @Column(DataType.STRING)
  indexer!: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
  })
  downloading!: boolean;

  @Column({
    type: DataType.STRING,
    defaultValue: '',
  })
  state!: string;

  @Column(DataType.STRING)
  infoHash!: string;

  @BelongsToMany(() => Query, () => QueryResult)
  queries!: Query[];

  @BelongsTo(() => Torrent, { foreignKey: 'infoHash', targetKey: 'hash', constraints: false })
  torrent!: CreationOptional<Torrent>;
}