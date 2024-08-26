import { Table, Column, Model, DataType, ForeignKey, BelongsTo, BelongsToMany } from 'sequelize-typescript';
import { QueryGroup, QueryResult, Result } from './index';
import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';

@Table({
  timestamps: false,
})
export class Query extends Model<InferAttributes<Query>, InferCreationAttributes<Query>> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column(DataType.STRING)
  searchQuery!: string;

  @Column(DataType.STRING)
  prowlerTag!: string;

  @Column(DataType.STRING)
  targetQuality!: string;

  @Column(DataType.INTEGER)
  searchFrequency!: number;

  @Column(DataType.STRING)
  includesRegex!: string;

  @Column(DataType.STRING)
  excludesRegex!: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  loopRunning!: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false
  })
  downloadComplete!: boolean;

  @ForeignKey(() => QueryGroup)
  @Column(DataType.INTEGER)
  queryGroupId!: number | null;

  @BelongsTo(() => QueryGroup, { foreignKey: 'queryGroupId', constraints: false })
  queryGroup!: QueryGroup | null;

  @BelongsToMany(() => Result, () => QueryResult)
  results!: Result[];
}