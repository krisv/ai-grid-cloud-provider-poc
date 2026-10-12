import { ApiError } from './errors.mjs';
import { clusterNameSchema, enrollClusterSchema } from '../shared/cluster-validation.mjs';
export function createClusterApi(hub,{json,readJson}) {
  return async request=>{
    const path=new URL(request.url).pathname;
    if(path==='/api/clusters') {
      if(request.method!=='GET')throw new ApiError(405,'validation','This HTTP method is not supported.');
      return json(await hub.list());
    }
    const match=path.match(/^\/api\/clusters\/([^/]+)$/);if(!match)return undefined;
    if(request.method!=='PATCH')throw new ApiError(405,'validation','This HTTP method is not supported.');
    let name;try {name=decodeURIComponent(match[1]);}catch {throw new ApiError(400,'validation','Invalid cluster name.');}
    if(!clusterNameSchema.safeParse(name).success)throw new ApiError(422,'validation','Invalid cluster name.');
    if(!enrollClusterSchema.safeParse(await readJson(request)).success)
      throw new ApiError(422,'validation','Only aiGridEnabled: true is supported.');
    return json(await hub.enroll(name));
  };
}
