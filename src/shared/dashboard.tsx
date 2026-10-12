// Standalone adapters for the dashboard page/table/resource presentation boundary.
import { useEffect, useState, type ReactElement, type ReactNode, type ComponentProps } from 'react';
import { Alert, Breadcrumb, Button, EmptyState, EmptyStateActions, EmptyStateBody, EmptyStateFooter,
  PageSection, Pagination, Spinner, Title, Tooltip } from '@patternfly/react-core';
import { Table as PfTable, Thead, Tr, Th, Tbody, Td, type ThProps } from '@patternfly/react-table';
export enum TrackingOutcome { submit='submit', cancel='cancel' }
export type SortableData<T> = {label:string;field:string;width?:ThProps['width'];sortable:(a:T,b:T)=>number};
export function ApplicationsPage({title,description,breadcrumb,headerAction,loaded,loadError,children,errorMessage}: {
  title:string;description?:ReactNode;breadcrumb?:ReactElement;headerAction?:ReactNode;loaded:boolean;loadError?:Error;
  empty:boolean;children?:ReactNode;errorMessage?:string;
}) {
  return <><PageSection>{breadcrumb}
    <div className="portal-page-heading"><Title headingLevel="h1" size="2xl">{title}</Title>{headerAction}</div>{description}</PageSection>
    {!loaded ? <PageSection><Spinner aria-label="Loading data" /></PageSection> : loadError ?
      <PageSection><Alert variant="danger" isInline title={errorMessage ?? 'Unable to load subscriptions'}>{loadError.message}<div><Button variant="link" onClick={()=>window.location.reload()}>Retry</Button></div></Alert></PageSection> : children}
  </>;
}
export const ResourceNameTooltip = ({name,children}: {name:string;children:ReactElement}) => <Tooltip content={`Resource name: ${name}`}>{children}</Tooltip>;
export const ResourceTr = ({isDeleting,children,...props}: ComponentProps<typeof Tr> & {isDeleting?:boolean}) =>
  <Tr {...props} aria-disabled={isDeleting || undefined}>{children}</Tr>;
export function DashboardEmptyTableView({onClearFilters}: {onClearFilters:()=>void}) {
  return <EmptyState titleText="No results found" headingLevel="h2"><EmptyStateBody>Adjust your filter to find subscriptions.</EmptyStateBody>
    <EmptyStateFooter><EmptyStateActions><Button variant="link" onClick={onClearFilters}>Clear all filters</Button></EmptyStateActions></EmptyStateFooter></EmptyState>;
}
export function Table<T>({data,columns,rowRenderer,toolbarContent,emptyTableView,...props}: {
  data:T[];columns:SortableData<T>[];rowRenderer:(row:T,index:number)=>ReactNode;toolbarContent?:ReactElement;emptyTableView?:ReactNode;
  enablePagination?:boolean;disableRowRenderSupport?:boolean;isExpandable?:boolean;onClearFilters?:()=>void;actionsColumnLabel?:string;'data-testid'?:string;'aria-label'?:string;
}) {
  const [sortIndex,setSortIndex]=useState(0);const [direction,setDirection]=useState<'asc'|'desc'>('asc');
  const [page,setPage]=useState(1);const [perPage,setPerPage]=useState(10);
  const maxPage=Math.max(1,Math.ceil(data.length/perPage));const safePage=Math.min(page,maxPage);
  useEffect(()=>setPage(1),[data]);
  const sorted=[...data].sort((a,b)=>columns[sortIndex].sortable(a,b)*(direction==='asc'?1:-1));
  const pagination = (bottom=false) => <Pagination itemCount={data.length} page={safePage} perPage={perPage} variant={bottom?'bottom':'top'}
    onSetPage={(_e,value)=>setPage(value)} onPerPageSelect={(_e,value)=>{setPerPage(value);setPage(1);}} />;
  return <>{toolbarContent}<div className="portal-table-pagination">{pagination()}</div>
    <PfTable className="portal-resource-table" aria-label={props['aria-label'] ?? 'Subscriptions'} isExpandable data-testid={props['data-testid']}>
      <Thead><Tr>{columns.map((col,index)=><Th key={col.field} width={col.width} sort={{sortBy:{index:sortIndex,direction},columnIndex:index,
        onSort:(_e,i,dir)=>{setSortIndex(i);setDirection(dir);}}}>{col.label}</Th>)}{props.actionsColumnLabel ? <Th>{props.actionsColumnLabel}</Th> : <Th screenReaderText="Actions" />}</Tr></Thead>
      {sorted.length ? sorted.slice((safePage-1)*perPage,safePage*perPage).map(rowRenderer) : <Tbody><Tr><Td colSpan={columns.length+1}>{emptyTableView}</Td></Tr></Tbody>}
    </PfTable><div className="portal-table-pagination">{pagination(true)}</div></>;
}
