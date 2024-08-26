import { Model, Table, Column, ForeignKey } from 'sequelize-typescript';
import { Query } from './Query'; // Adjust the import based on your project structure
import { Result } from './Result'; // Adjust the import based on your project structure
import { InferAttributes, InferCreationAttributes } from 'sequelize';

@Table
export class QueryResult extends Model<InferAttributes<QueryResult>, InferCreationAttributes<QueryResult>> {
    @ForeignKey(() => Query)
    @Column
    queryId!: number;

    @ForeignKey(() => Result)
    @Column
    guid!: string;
}
