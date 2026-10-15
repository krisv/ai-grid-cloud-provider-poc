import { expect,it } from 'vitest';
import { tenantUsage } from '../demoObservability';
import type { GridOverview } from '~/services/subscriptions/SubscriptionService';
it('uses supplied identities and changes token mixes across windows without double counting cached input',()=>{
 const tenants=[{name:'coca-cola'},{name:'pepsi'}];
 const metric:GridOverview['metrics'][number]={key:'requests',label:'Requests',unit:'req/s',status:'ok',points:Array.from({length:1441},(_,i)=>({timestamp:100000-i*60,value:100})).reverse()};
 const day=tenantUsage([metric],tenants),hour=tenantUsage([{...metric,points:metric.points.slice(-61)}],tenants);
 expect(day.map(t=>t.id)).toEqual(['coca-cola','pepsi']);expect(tenantUsage([metric],[])).toEqual([]);
 expect(hour[0].cached).toBeGreaterThan(0);expect(day[0].input).toBeGreaterThan(hour[0].input);
 expect(day[0].input/day[1].input).not.toBeCloseTo(hour[0].input/hour[1].input,3);
 expect(day[0].cached/day[0].input).not.toBeCloseTo(hour[0].cached/hour[0].input,3);
});
