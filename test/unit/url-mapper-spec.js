import UrlMapper from '../../src/url-mapper.js';

describe('url mapper', function() {
  const update = sinon.spy();

  let urlMapper;
  let dbMock;
  beforeEach(function() {
    dbMock = {
      find: function() {
      },
      insert: function() {
      },
      remove: function() {
      },
      count: function() {
      }
    };

    sinon.stub(dbMock);

    dbMock.remove.callsArg(2);

    urlMapper = new UrlMapper(dbMock, update);
  });

  function check(testUrl, expected) {
    const {url, newUrl = 'newUrl', isLocal = true, isActive = true} = expected;
    const mappedUrl = urlMapper.get(testUrl);
    expect(mappedUrl).toEqual({
      url,
      newUrl,
      isLocal,
      isActive
    });
  }

  function set(mapping) {
    const {newUrl = 'newUrl', isLocal = true, isActive = true} = mapping;
    urlMapper.set(
      mapping.url,
      newUrl,
      isLocal,
      isActive
    );
  }

  describe('set', function() {
    it('saves mapped urls to the database', function() {
      const url = 'foo.com/bar/baz';
      const newUrl = 'foo.com/bar/mapped';
      const isLocal = false;
      const isActive = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );

      expect(dbMock.insert).toHaveBeenCalledWith({
        url,
        newUrl,
        isLocal,
        isActive
      });
    });

    it('removes existing urls before adding them', function() {
      const url = 'foo.com/bar/baz';
      const newUrl = 'foo.com/bar/mapped';
      const isLocal = false;
      const isActive = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );

      expect(dbMock.remove).toHaveBeenCalledWith({url});
    });

    it('adds a slash to `newUrl` when the url has no path and no slash at the end', function() {
      const url = 'foo.com/bar/baz';
      const newUrl = 'foo.com';
      const isLocal = false;
      const isActive = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );

      expect(dbMock.insert).toHaveBeenCalledWith({
        url,
        newUrl: 'foo.com/',
        isLocal,
        isActive
      });
    });

    it('does not add a slash when the path is local', function() {
      const url = 'foo.com/bar/baz';
      const newUrl = 'foo/bar';
      const isLocal = true;
      const isActive = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );

      expect(dbMock.insert).toHaveBeenCalledWith({
        url,
        newUrl: 'foo/bar',
        isLocal,
        isActive
      });
    });

    describe('protocol-removal', function() {
      const newUrl = 'newUrl';
      const isLocal = true;
      const isActive = true;
      const expectedMapping = {
        url: 'foo.com/bar',
        newUrl: newUrl,
        isLocal: isLocal,
        isActive: isActive
      };

      it('should work for http sources', function() {
        const http = {
          url: 'http://foo.com/bar',
          newUrl: newUrl,
          isLocal: isLocal,
          isActive: isActive
        };
        set(http);
        expect(dbMock.insert).toHaveBeenCalledWith(expectedMapping);
      });

      it('should work for https sources', function() {
        const https = {
          url: 'https://foo.com/bar',
          newUrl: newUrl,
          isLocal: isLocal,
          isActive: isActive
        };
        set(https);
        expect(dbMock.insert).toHaveBeenCalledWith(expectedMapping);
      });

      it('should apply to requests coming in', function() {
        const http = {
          url: 'http://foo.com/bar',
          newUrl: newUrl,
          isLocal: isLocal,
          isActive: isActive
        };

        set(http);
        check('http://foo.com/bar', expectedMapping);
      });
    });

    it('should remove the protocol from the destination url', function() {
      const mapping = {
        url: 'http://foo.com/bar',
        newUrl: 'newUrl',
        isLocal: true,
        isActive: true
      };
      const expected = {
        url: 'foo.com/bar',
        newUrl: mapping.newUrl,
        isLocal: mapping.isLocal,
        isActive: mapping.isActive
      };

      set(mapping);
      expect(dbMock.insert).toHaveBeenCalledWith(expected)
    });
  });

  describe('get', function() {
    const specific = {
      url: 'foo.com/bar/baz',
      newUrl: 'foo/specific'
    };

    const oneWildcard = {
      url: 'foo.com/*/baz',
      newUrl: 'foo/oneWildcard'
    };

    const multiWildcard = {
      url: 'foo.com/*/*',
      newUrl: 'foo/multiwildcard'
    };

    it('returns undefined if no matching maps', function() {
      set(specific);
      set(oneWildcard);
      set(multiWildcard);
      expect(urlMapper.get('dunx')).toEqual(undefined);
    });

    it('matches plain urls', function() {
      set(specific);
      check(specific.url, specific);
    });

    it('matches wildcards', function() {
      set(oneWildcard);
      check('foo.com/1/baz', oneWildcard);
    });

    it('matches multi-wildcards', function() {
      set(multiWildcard);
      check('foo.com/2/bork', multiWildcard);
    });

    it('matches most-specific url', function() {
      set(specific);
      set(oneWildcard);
      set(multiWildcard);
      check('foo.com/bar/baz', specific);
      check('foo.com/derp/baz', oneWildcard);
      check('foo.com/derp/any', multiWildcard);
    });

    it('when the same amount of wildcards, matches the one with the longer direct-match on the left', function() {
      const early = {
        url: 'foo.com/*/spaghetti',
        newUrl: 'foo/earlyWildcard'
      };

      const late = {
        url: 'foo.com/bar/*',
        newUrl: 'foo/lateWildcard'
      };

      set(early);
      set(late);
      check('foo.com/bar/spaghetti', late);
    });

    it('should do longer direct-match, even when first wildcards are in same position', function() {
      const earlyMulti = {
        url: 'bar.com/*/*/baz',
        newUrl: 'bar/earlyMultiWildcard'
      };

      const lateMulti = {
        url: 'bar.com/*/foo/*',
        newUrl: 'bar/lateMultiWildcard'
      };

      set(earlyMulti);
      set(lateMulti);
      check('bar.com/yolo/foo/baz', lateMulti);
    });
  });

  describe('remove', function() {
    let url;
    let newUrl;
    let isLocal;
    const isActive = true;
    beforeEach(function() {
      url = 'foo.com/bar/baz';
      newUrl = 'foo/bar';
      isLocal = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
    });

    it('removes mappings', function() {
      urlMapper.remove(url);
      const mappedUrl = urlMapper.get(url);
      expect(mappedUrl).toEqual(undefined);
    });
  });

  describe('isMappedUrl', function() {
    let url;
    let newUrl;
    let isLocal;
    let isActive;

    beforeEach(function() {
      url = 'foo.com/bar/baz';
      newUrl = 'foo/bar';
      isLocal = true;
      isActive = true;
    });

    it('returns false if the given `url` is not mapped', function() {
      url = 'not.mapped.com/';
      expect(urlMapper.isMappedUrl(url)).toBe(false);
    });

    it('returns true if the given `url` is mapped', function() {
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
      expect(urlMapper.isMappedUrl(url)).toBe(true);
    });
  });

  describe('isActiveMappedUrl', function() {
    let url;
    let newUrl;
    let isLocal;
    let isActive;

    beforeEach(function() {
      url = 'foo.com/bar/baz';
      newUrl = 'foo/bar';
      isLocal = true;
      isActive = true;
    });

    it('returns false if the given `url` is not mapped', function() {
      url = 'not.mapped.com/';
      expect(urlMapper.isActiveMappedUrl(url)).toBe(false);
    });

    it('returns false if the given `url` is mapped but inactive', function() {
      isActive = false;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
      expect(urlMapper.isActiveMappedUrl(url)).toBe(false);
    });

    it('returns true if the given `url` is mapped and active', function() {
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
      expect(urlMapper.isActiveMappedUrl(url)).toBe(true);
    });
  });

  describe('count', function() {
    let url;
    let newUrl;
    let isLocal;
    const isActive = true;
    beforeEach(function() {
      url = 'foo.com/bar/baz';
      newUrl = 'foo/bar';
      isLocal = true;
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
    });

    it('returns the number of urlMappings', function() {
      const count = urlMapper.count();
      expect(count).toEqual(1);
    });

    it('returns 1 after adding the same mapping twice', function() {
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
      const count = urlMapper.count();
      expect(count).toEqual(1);
    });

    it('returns 0 after removing a mapping', function() {
      urlMapper.set(
        url,
        newUrl,
        isLocal,
        isActive
      );
      urlMapper.remove(url);
      const count = urlMapper.count();
      expect(count).toEqual(0);
    });
  });

  describe('mappings', function() {
    let mappings;
    const first = {
      url: 'foo.com/bar/baz',
      newUrl: 'foo/bar',
      isLocal: true,
      isActive: true
    };
    const second = {
      url: 'foo.com/bar/baz2',
      newUrl: 'foo/bar2',
      isLocal: true,
      isActive: false
    };

    beforeEach(function() {
      urlMapper.set(
        first.url,
        first.newUrl,
        first.isLocal,
        first.isActive
      );
      urlMapper.set(
        second.url,
        second.newUrl,
        first.isLocal,
        second.isActive
      );
      mappings = urlMapper.mappings();
    });

    it('returns a list of all mappings, regardless of if active', function() {
      expect(mappings.length).toEqual(2);
    });

    it('should provide match url, newUrl url, and whether or not is active', function() {
      const expected = JSON.stringify([first, second]);
      expect(JSON.stringify(mappings)).toEqual(expected);
    });

    it('should return a clone, so that mappings can\'t be tampered with', function() {
      mappings[0].url = 'jookd.net';
      const unwanted = JSON.stringify(mappings);
      const newMappings = urlMapper.mappings();
      expect(JSON.stringify(newMappings)).not.toEqual(unwanted);
    });
  });
});
