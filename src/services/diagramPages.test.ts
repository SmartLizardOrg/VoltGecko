import { describe, expect, it } from 'vitest';
import { diagramTiles } from './diagramPages';
describe('readable PDF diagram pagination',()=>{
  it('keeps normal device cards whole across both page axes and preserves complete drawing coverage',()=>{
    const blocks=Array.from({length:12},(_,index)=>({x:48+(index%6)*324,y:170+Math.floor(index/6)*500,width:264,height:236}));
    const tiles=diagramTiles({width:2050,height:1300,blocks},1476,807);
    for(const block of blocks)expect(tiles.some(tile=>tile.x<=block.x&&tile.x+tile.width>=block.x+block.width&&tile.y<=block.y&&tile.y+tile.height>=block.y+block.height)).toBe(true);
    expect(tiles[0].x).toBe(0);expect(tiles[0].y).toBe(0);
    const row=tiles.filter(tile=>tile.row===1);
    row.forEach((tile,index)=>{if(index>0)expect(tile.x).toBeCloseTo(row[index-1].x+row[index-1].width);});
    expect(row.at(-1)!.x+row.at(-1)!.width).toBe(2050);
    const column=tiles.filter(tile=>tile.column===1);
    column.forEach((tile,index)=>{if(index>0)expect(tile.y).toBeCloseTo(column[index-1].y+column[index-1].height);});
    expect(column.at(-1)!.y+column.at(-1)!.height).toBe(1300);
  });
  it('exports all portions of a card taller than a page without looping or skipping its data',()=>{
    const tiles=diagramTiles({width:640,height:4000,blocks:[{x:48,y:100,width:264,height:3500}]},1476,807);
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles.reduce((sum,tile)=>sum+tile.height,0)).toBe(4000);
    expect(tiles.every(tile=>tile.height>0&&tile.height<=807)).toBe(true);
  });
  it('bounds resource use for impossible dimensions and very large documents',()=>{
    expect(()=>diagramTiles({width:0,height:100,blocks:[]},100,100)).toThrow();
    expect(()=>diagramTiles({width:100,height:1e9,blocks:[]},100,100)).toThrow('Too many');
  });
});
