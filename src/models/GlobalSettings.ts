import { Table, Column, Model, DataType, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { QueryGroup } from './QueryGroup';
import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize/types/model';

@Table({
  timestamps: false,
})
export class GlobalSettings extends Model<InferAttributes<GlobalSettings>, InferCreationAttributes<GlobalSettings>> {
  @Column({
    type: DataType.STRING,
    primaryKey: true,
  })
  key!: string;

  @Column(DataType.STRING)
  value!: string;
}