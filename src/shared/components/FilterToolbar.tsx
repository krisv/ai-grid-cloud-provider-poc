import { Button, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core';
import type { ReactNode } from 'react';
export default function FilterToolbar<K extends string>({filterOptions,filterOptionRenders,filterData,onFilterUpdate,children,...props}: {
  filterOptions:Record<K,string>;filterOptionRenders:Record<K,(props:{value:string;onChange:(value:string)=>void;onClear:()=>void})=>ReactNode>;
  filterData:Record<K,string | undefined>;onFilterUpdate:(key:K,value?:string | {label:string;value:string})=>void;children?:ReactNode;'data-testid'?:string;
}) {
  return <Toolbar data-testid={props['data-testid']}><ToolbarContent>
    {Object.keys(filterOptions).map(key=>{const k=key as K;return <ToolbarItem key={key}>{filterOptionRenders[k]({value:filterData[k] ?? '',onChange:value=>onFilterUpdate(k,value),onClear:()=>onFilterUpdate(k,'')})}</ToolbarItem>;})}
    {children}{Object.values(filterData).some(Boolean) && <ToolbarItem><Button variant="link" onClick={()=>Object.keys(filterOptions).forEach(key=>onFilterUpdate(key as K,''))}>Clear all filters</Button></ToolbarItem>}
  </ToolbarContent></Toolbar>;
}
