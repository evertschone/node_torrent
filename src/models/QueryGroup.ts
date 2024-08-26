import { Table, Column, Model, DataType, HasMany } from 'sequelize-typescript';
import { Query } from './Query';
import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';

@Table({
  timestamps: false,
})
export class QueryGroup extends Model<InferAttributes<QueryGroup>, InferCreationAttributes<QueryGroup>> {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id!: number;

  @Column(DataType.STRING)
  name!: string;

  @Column(DataType.STRING)
  sourceUrl!: string;

  @Column(DataType.STRING)
  scraperUrl!: string;

  @Column(DataType.STRING)
  prowlerTag!: string;

  @Column(DataType.STRING)
  indexers!: string;

  @Column(DataType.STRING)
  targetQuality!: string;

  @Column(DataType.INTEGER)
  searchFrequency!: number;

  @Column(DataType.STRING)
  includesRegex!: string;

  @Column(DataType.STRING)
  excludesRegex!: string;

  @HasMany(() => Query, { foreignKey: 'queryGroupId', constraints: false })
  queries!: Query[];
}
