/**
 * @experimental this feature is experimental and may not be stable
 */
export type PageUrlEnrichmentOptions = {
  // a list of domains that are to be considered internal, e.g. 'example.com', 'example.co.uk'.
  // Previous Page URLs will be matched to these strings to determine the Previous Page URL type.
  // Adding the domain is sufficient, there is no need to add the subdomain.
  internalDomains?: string[];
};
