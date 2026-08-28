export function applyInventoryPolicy(payload) {
 const rows=payload.rows.filter(r=>typeof r.lot==='string'&&r.lot.trim()!==''&&Number.isInteger(r.plantingYear));
 const {sourceTotals,calculated,reconciliation,totalsRows,formulas:oldFormulas,...base}=payload;
 const sum=field=>{const values=rows.map(r=>r[field]).filter(v=>typeof v==='number'&&Number.isFinite(v));return values.length?values.reduce((a,b)=>a+b,0):null};
 const formulas=Object.assign({},...rows.map(r=>r.formulas??{}));
 return {...base,rows,formulas,inclusionRule:'lot-planting-year-v1',
  includedTotals:{area:sum('area'),areaAlqueria:sum('areaAlqueria'),totalAlive:sum('totalAlive'),planted:sum('trees')},
  summary:{rows:rows.length,review:rows.filter(r=>r.state==='REVIEW').length,formulaCells:Object.keys(formulas).length},
  warnings:(payload.warnings??[]).filter(w=>!w.startsWith('El total de '))};
}
