interface Block { x:number; y:number; width:number; height:number }
export interface DiagramTile extends Block { column:number; row:number; columns:number; rows:number }

/** Continuous coverage; page boundaries move into whitespace around normal-sized cards. */
export function diagramTiles(drawing:{width:number;height:number;blocks:Block[]},maxWidth:number,maxHeight:number):DiagramTile[]{
  const segments=(extent:number,limit:number,blocks:{start:number;end:number}[])=>{
    if(!Number.isFinite(extent)||!Number.isFinite(limit)||extent<=0||limit<=0)throw new Error('Invalid diagram dimensions');
    const spans:{start:number;length:number}[]=[];
    let start=0;
    while(start<extent-1e-7){
      let end=Math.min(start+limit,extent);
      const crossing=blocks.filter(block=>block.start<end&&block.end>end);
      if(crossing.length){
        const before=Math.min(...crossing.map(block=>block.start))-12;
        // Oversized cards still get every part exported, with a guaranteed forward step.
        if(before>start+24)end=before;
      }
      spans.push({start,length:end-start});start=end;
      if(spans.length>200)throw new Error('Too many diagram pages');
    }
    return spans;
  };
  const xs=segments(drawing.width,maxWidth,drawing.blocks.map(block=>({start:block.x,end:block.x+block.width})));
  const ys=segments(drawing.height,maxHeight,drawing.blocks.map(block=>({start:block.y,end:block.y+block.height})));
  if(xs.length*ys.length>200)throw new Error('Too many diagram pages');
  return ys.flatMap((y,row)=>xs.map((x,column)=>({x:x.start,y:y.start,width:x.length,height:y.length,column:column+1,row:row+1,columns:xs.length,rows:ys.length})));
}
