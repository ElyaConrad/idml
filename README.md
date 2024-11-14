### Some words about filters

Filters in SVG are very complex. In fact, they can manipulate the SourceGraphic in any way that is unlikely possible to "flat" for at least two reasons:

- If a filter applies on a group of shapes, there may is no actual way to "flat" it's behaviour down to the actual shapes
- Even if a filter just applies on one element, its unlikely that this can be converted to whatever target format you want to address

So there exist two solutions for "reducing" a filter that actually make sense:

1. Rasterize everyting that spells the word "filter"
2. Extracting specific kinds of filters and apply them on the least flattenable structure
   - In case of "just" some color matrix magic, we can trace this stuff down (and multiply on the way) to the final shape
   - But if there are ANY offset, flood or merge operations we're kind of fucked: We need to preserve the group OR raster the whole thing OR just ignore it

In fact we're supportting both. You can choose between (1) and (2) and specify how you like to handle the "crazy" filters.
