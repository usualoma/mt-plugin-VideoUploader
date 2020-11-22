package MT::Plugin::VideoUploader;

use strict;
use warnings;
use utf8;

use File::Basename qw(basename dirname);

sub component {
    __PACKAGE__ =~ m/::([^:]+)\z/;
}

sub plugin {
    MT->component( component() );
}

sub insert_after {
    my ( $tmpl, $id, $tokens ) = @_;

    my $before = $id ? $tmpl->getElementById($id) : undef;

    if ( !ref $tokens ) {
        $tokens = plugin()->load_tmpl($tokens)->tokens;
    }

    foreach my $t (@$tokens) {
        $tmpl->insertAfter( $t, $before );
        $before = $t;
    }
}

sub template_param_async_asset_upload {
    my ( $cb, $app, $param, $tmpl ) = @_;

    my $video_uploader_static_path = do {
        my $plugin      = plugin();
        my $static      = $app->static_path;
        my $plugin_name = basename( $plugin->{full_path} );
        my $dir         = basename( dirname( $plugin->{full_path} ) );
        "$static$dir/$plugin_name";
    };

    insert_after( $tmpl, 'normalize_orientation', 'async_asset_upload.tmpl' );
    insert_after(
        $tmpl,
        'normalize_orientation',
        [   $tmpl->createElement(
                'var',
                {   name  => 'video_uploader_static_path',
                    value => $video_uploader_static_path,
                }
            ),
        ]
    );
    insert_after( $tmpl, undef, 'async_asset_upload_modal.tmpl' );
}

sub cms_pre_save_asset {
    my ( $cb, $app, $asset ) = @_;

    return 1 if $asset->class_type ne 'video';

    for my $k (qw(video_uploader_width video_uploader_height)) {
        if ( my $v = $app->param($k) ) {
            $asset->$k( int $v );
        }
    }

    return 1;
}

sub init_app {
    require MT::Asset::Video;
    require Class::Method::Modifiers;
    Class::Method::Modifiers::around(
        'MT::Asset::Video::as_html',
        sub {
            my $orig    = shift;
            my $asset   = shift;
            my ($param) = @_;
            if (!(     $asset->video_uploader_width
                    && $asset->video_uploader_height
                    && $param->{include}
                )
                )
            {
                return $asset->$orig(@_);
            }

            my $blog = $asset->blog
                or return '';
            my %tmpls = (
                map { $_->blog_id => $_ } MT->model('template')->load(
                    {   blog_id => [ 0, $blog->id, $blog->parent_id ],
                        type    => 'custom',
                        name    => 'VideoUploader::as_html',
                    }
                )
            );

            my $tmpl = $tmpls{ $blog->id } || $tmpls{ $blog->parent_id } || $tmpls{0};
            if ($tmpl) {
                my $ctx = $tmpl->context;
                $ctx->stash(blog => $blog);
                $ctx->stash(asset => $asset);
                return $tmpl->output || $tmpl->errstr;
            }

            return <<__HTML__;
<video controls width="@{[$asset->video_uploader_width]}" height="@{[$asset->video_uploader_height]}">
  <source src="@{[$asset->url]}" type="video/mp4">
</video>
__HTML__
        }
    );
}

1;
